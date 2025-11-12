const functions = require('firebase-functions');
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
const { v4: uuidv4 } = require('uuid');
const cors = require('cors');
const ffmpeg = require('fluent-ffmpeg');
const axios = require('axios');
const { Storage } = require('@google-cloud/storage');

// Initialize Firebase Storage
const storage = new Storage();
const bucketName = process.env.FIREBASE_STORAGE_BUCKET || 'wan-video-animator.appspot.com';

const app = express();
const MAX_CONCURRENT_CHUNKS = 5;
const CHUNK_DURATION = 60; // 1 minute chunks

// DashScope API Configuration
const DASHSCOPE_API_ENDPOINT = 'https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/image2video/video-synthesis';
const DASHSCOPE_TASK_ENDPOINT = 'https://dashscope-intl.aliyuncs.com/api/v1/tasks';
const POLL_INTERVAL = 15000;

// Middleware
app.use(cors({ origin: true }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Create temp directories for Cloud Functions
const os = require('os');
const TEMP_DIR = os.tmpdir();
const UPLOAD_DIR = path.join(TEMP_DIR, 'uploads');
const CHUNKS_DIR = path.join(TEMP_DIR, 'chunks');
const OUTPUT_DIR = path.join(TEMP_DIR, 'outputs');

[UPLOAD_DIR, CHUNKS_DIR, OUTPUT_DIR].forEach(dir => {
  if (!fsSync.existsSync(dir)) {
    fsSync.mkdirSync(dir, { recursive: true });
  }
});

// Multer configuration for memory storage
const memoryStorage = multer.memoryStorage();
const upload = multer({ 
  storage: memoryStorage,
  limits: { 
    fileSize: 2000 * 1024 * 1024,
    files: 10
  }
});

const imageUpload = multer({
  storage: memoryStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

// Job tracking
const jobs = new Map();

// Upload file to Firebase Storage
async function uploadToFirebaseStorage(buffer, filename, contentType) {
  const bucket = storage.bucket(bucketName);
  const file = bucket.file(`uploads/${filename}`);
  
  await file.save(buffer, {
    contentType: contentType,
    metadata: {
      cacheControl: 'public, max-age=3600',
    },
  });

  // Make file publicly accessible
  await file.makePublic();
  
  // Return public URL
  return `https://storage.googleapis.com/${bucketName}/uploads/${filename}`;
}

// Get video duration
function getVideoDuration(videoPath) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(videoPath, (err, metadata) => {
      if (err) return reject(err);
      resolve(metadata.format.duration);
    });
  });
}

// Split video into chunks
function splitVideoIntoChunks(videoPath, outputDir, chunkDuration = 60) {
  return new Promise(async (resolve, reject) => {
    try {
      const duration = await getVideoDuration(videoPath);
      const numChunks = Math.ceil(duration / chunkDuration);
      const chunks = [];

      console.log(`   📊 Will create ${numChunks} chunks of ${chunkDuration}s each`);

      for (let i = 0; i < numChunks; i++) {
        const startTime = i * chunkDuration;
        const chunkPath = path.join(outputDir, `chunk_${i}.mp4`);
        
        console.log(`   ✂️ Creating chunk ${i + 1}/${numChunks} (start: ${startTime}s)...`);
        
        await new Promise((res, rej) => {
          ffmpeg(videoPath)
            .setStartTime(startTime)
            .setDuration(chunkDuration)
            .output(chunkPath)
            .videoCodec('libx264')
            .audioCodec('aac')
            .on('end', () => {
              console.log(`   ✅ Chunk ${i + 1} complete`);
              res();
            })
            .on('error', (err) => {
              console.error(`   ❌ Error creating chunk ${i + 1}:`, err.message);
              rej(err);
            })
            .run();
        });

        chunks.push(chunkPath);
      }

      resolve(chunks);
    } catch (error) {
      reject(error);
    }
  });
}

// Merge video chunks
function mergeVideoChunks(chunkPaths, outputPath) {
  return new Promise((resolve, reject) => {
    console.log(`   🔗 Merging ${chunkPaths.length} chunks...`);
    const listFile = path.join(path.dirname(outputPath), 'filelist.txt');
    const fileList = chunkPaths.map(p => `file '${p}'`).join('\n');
    
    fsSync.writeFileSync(listFile, fileList);

    ffmpeg()
      .input(listFile)
      .inputOptions(['-f concat', '-safe 0'])
      .outputOptions(['-c copy'])
      .output(outputPath)
      .on('end', () => {
        fsSync.unlinkSync(listFile);
        resolve(outputPath);
      })
      .on('error', (err) => {
        if (fsSync.existsSync(listFile)) {
          fsSync.unlinkSync(listFile);
        }
        reject(err);
      })
      .run();
  });
}

// API Routes
app.post('/api/upload-character-image', imageUpload.single('characterImage'), async (req, res) => {
  try {
    console.log('\n📸 Character image upload request received');
    
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No image file provided' });
    }

    const filename = `character_${uuidv4()}${path.extname(req.file.originalname)}`;
    const publicUrl = await uploadToFirebaseStorage(req.file.buffer, filename, req.file.mimetype);
    
    console.log('✅ Character image uploaded to Firebase Storage');
    console.log('   Public URL:', publicUrl);

    res.json({ 
      success: true, 
      imagePath: publicUrl,
      filename: filename
    });
  } catch (error) {
    console.error('❌ Error uploading character image:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/upload', (req, res) => {
  upload.array('videos', 10)(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ success: false, error: err.message });
    }

    try {
      if (!req.files || req.files.length === 0) {
        return res.status(400).json({ success: false, error: 'No files uploaded' });
      }

      console.log('\n🎬 Video upload request received - Uploading to Firebase Storage');
      console.log('   Files:', req.files.length);
      
      const files = await Promise.all(req.files.map(async (f) => {
        const filename = `${uuidv4()}${path.extname(f.originalname)}`;
        const publicUrl = await uploadToFirebaseStorage(f.buffer, filename, f.mimetype);
        
        console.log(`   ✅ ${f.originalname} → Firebase Storage`);
        
        return {
          id: uuidv4(),
          filename: filename,
          originalName: f.originalname,
          path: publicUrl, // Now using Firebase Storage URL
          size: f.size,
          publicUrl: publicUrl
        };
      }));

      res.json({ success: true, files });
    } catch (error) {
      console.error('❌ Error processing uploads:', error.message);
      res.status(500).json({ success: false, error: error.message });
    }
  });
});

app.post('/api/process', async (req, res) => {
  try {
    console.log('\n' + '='.repeat(60));
    console.log('🎥 PROCESSING REQUEST RECEIVED - DashScope API + Firebase');
    console.log('='.repeat(60));
    
    const { files, apiKey, characterImagePath, mode } = req.body;

    console.log('📋 Configuration:');
    console.log('   Files to process:', files.length);
    console.log('   Mode:', mode || 'wan-std');
    console.log('   Chunk duration:', CHUNK_DURATION, 'seconds');
    console.log('   Max concurrent:', MAX_CONCURRENT_CHUNKS);

    if (!apiKey) {
      return res.status(400).json({ success: false, error: 'API key is required' });
    }

    const jobId = uuidv4();
    const job = {
      id: jobId,
      status: 'processing',
      files: files,
      results: [],
      progress: 0,
      totalChunks: 0,
      processedChunks: 0,
      createdAt: new Date(),
      config: { characterImageUrl: characterImagePath, mode: mode || 'wan-std', apiKey }
    };

    jobs.set(jobId, job);
    console.log('✅ Job created:', jobId);

    // Note: In Firebase, this would run in the background
    processVideosDashScope(jobId, files, job.config).catch(err => {
      console.error('❌ Processing error:', err.message);
      job.status = 'error';
      job.error = err.message;
    });

    res.json({ success: true, jobId });
  } catch (error) {
    console.error('❌ Error starting processing:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/status/:jobId', (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job) {
    return res.status(404).json({ success: false, error: 'Job not found' });
  }
  res.json({ success: true, job });
});

app.get('/api/download/:jobId/:fileId', (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job) {
    return res.status(404).json({ success: false, error: 'Job not found' });
  }

  const result = job.results.find(r => r.fileId === req.params.fileId);
  if (!result || !result.outputPath) {
    return res.status(404).json({ success: false, error: 'File not found' });
  }

  res.download(result.outputPath);
});

// Process videos function (reusing from server.js)
async function processVideosDashScope(jobId, files, config) {
  const job = jobs.get(jobId);
  console.log('\n📹 processVideosDashScope() started for job:', jobId);

  for (const file of files) {
    try {
      console.log('\n' + '-'.repeat(60));
      console.log(`📹 Processing file: ${file.originalName}`);
      
      job.currentFile = file.originalName;
      
      const fileChunkDir = path.join(CHUNKS_DIR, file.id);
      await fs.mkdir(fileChunkDir, { recursive: true });

      // Download video from Firebase Storage to temp location
      const tempVideoPath = path.join(UPLOAD_DIR, file.filename);
      console.log('📥 Downloading video from Firebase Storage...');
      const videoResponse = await axios.get(file.publicUrl, { responseType: 'arraybuffer' });
      await fs.writeFile(tempVideoPath, Buffer.from(videoResponse.data));
      
      job.status = `Splitting ${file.originalName}...`;
      console.log(`✂️ Splitting video into ${CHUNK_DURATION}-second chunks...`);
      
      const chunks = await splitVideoIntoChunks(tempVideoPath, fileChunkDir, CHUNK_DURATION);
      
      job.totalChunks += chunks.length;
      console.log(`✅ Video split into ${chunks.length} chunks`);

      // Upload chunks to Firebase Storage and get public URLs
      console.log('📤 Uploading chunks to Firebase Storage...');
      const chunkUrls = await Promise.all(
        chunks.map(async (chunkPath, idx) => {
          const chunkBuffer = await fs.readFile(chunkPath);
          const chunkFilename = `chunks/${file.id}/chunk_${idx}.mp4`;
          const bucket = storage.bucket(bucketName);
          const chunkFile = bucket.file(chunkFilename);
          
          await chunkFile.save(chunkBuffer, { contentType: 'video/mp4' });
          await chunkFile.makePublic();
          
          const publicUrl = `https://storage.googleapis.com/${bucketName}/${chunkFilename}`;
          console.log(`   ✅ Chunk ${idx + 1} uploaded: ${publicUrl}`);
          return { chunkPath, publicUrl, index: idx };
        })
      );

      console.log(`\n🚀 PARALLEL PROCESSING: Processing ${chunks.length} chunks in batches of ${MAX_CONCURRENT_CHUNKS}!`);
      job.status = `Processing ${chunks.length} chunks in parallel...`;
      
      const processChunk = async (chunkData, retryCount = 0) => {
        const maxRetries = 3;
        const retryDelay = 5000;
        const { chunkPath, publicUrl, index } = chunkData;
        const i = index;
        
        try {
          console.log(`\n🎬 [Chunk ${i + 1}/${chunks.length}] Starting...`);
          
          // Stagger requests
          await new Promise(resolve => setTimeout(resolve, i * 200));
          
          console.log(`   [Chunk ${i + 1}] Video URL: ${publicUrl}`);
          console.log(`   [Chunk ${i + 1}] 🚀 Creating DashScope task...`);
          
          const taskResponse = await axios.post(
            DASHSCOPE_API_ENDPOINT,
            {
              model: 'wan2.2-animate-mix',
              input: {
                image_url: config.characterImageUrl,
                video_url: publicUrl
              },
              parameters: {
                mode: config.mode,
                check_image: false
              }
            },
            {
              headers: {
                'Authorization': `Bearer ${config.apiKey}`,
                'Content-Type': 'application/json',
                'X-DashScope-Async': 'enable'
              },
              timeout: 30000
            }
          );

          const taskId = taskResponse.data.output.task_id;
          console.log(`   [Chunk ${i + 1}] ✅ Task created: ${taskId}`);
          
          const videoUrl = await pollDashScopeTask(taskId, config.apiKey, i + 1, chunks.length);
          
          const chunkOutputPath = path.join(fileChunkDir, `output_${i}.mp4`);
          const outputResponse = await axios.get(videoUrl, { responseType: 'arraybuffer' });
          await fs.writeFile(chunkOutputPath, Buffer.from(outputResponse.data));
          console.log(`   [Chunk ${i + 1}] ✅ Saved`);

          job.processedChunks++;
          job.progress = (job.processedChunks / job.totalChunks) * 100;
          
          return chunkOutputPath;
          
        } catch (error) {
          console.error(`   [Chunk ${i + 1}] ❌ Error: ${error.message}`);
          
          if (error.response && (error.response.status === 429 || error.response.status === 400) && retryCount < maxRetries) {
            console.log(`   [Chunk ${i + 1}] ⏳ Retry ${retryCount + 1}/${maxRetries} in ${retryDelay/1000}s...`);
            await new Promise(resolve => setTimeout(resolve, retryDelay));
            return processChunk(chunkData, retryCount + 1);
          }
          throw error;
        }
      };
      
      const processedChunks = [];
      for (let i = 0; i < chunkUrls.length; i += MAX_CONCURRENT_CHUNKS) {
        const batch = chunkUrls.slice(i, i + MAX_CONCURRENT_CHUNKS);
        const batchNumber = Math.floor(i / MAX_CONCURRENT_CHUNKS) + 1;
        const totalBatches = Math.ceil(chunkUrls.length / MAX_CONCURRENT_CHUNKS);
        
        console.log(`\n📦 Processing batch ${batchNumber}/${totalBatches} (${batch.length} chunks)`);
        
        const batchResults = await Promise.all(
          batch.map(chunkData => processChunk(chunkData))
        );
        
        processedChunks.push(...batchResults);
        console.log(`✅ Batch ${batchNumber}/${totalBatches} complete!`);
      }

      console.log(`\n🔗 Merging ${processedChunks.length} chunks...`);
      job.status = `Merging chunks...`;
      const finalOutputPath = path.join(OUTPUT_DIR, `${file.id}_animated.mp4`);
      await mergeVideoChunks(processedChunks, finalOutputPath);

      // Upload final video to Firebase Storage
      const finalBuffer = await fs.readFile(finalOutputPath);
      const finalFilename = `outputs/${file.id}_animated.mp4`;
      const finalUrl = await uploadToFirebaseStorage(finalBuffer, finalFilename, 'video/mp4');
      
      console.log('✅ Final video uploaded to Firebase Storage');

      job.results.push({
        fileId: file.id,
        originalName: file.originalName,
        outputPath: finalOutputPath,
        publicUrl: finalUrl,
        status: 'completed'
      });

      // Cleanup temp files
      await fs.rm(fileChunkDir, { recursive: true, force: true });

    } catch (error) {
      console.error(`❌ Error processing ${file.originalName}:`, error.message);
      job.results.push({
        fileId: file.id,
        originalName: file.originalName,
        status: 'error',
        error: error.message
      });
    }
  }

  job.status = 'completed';
  job.progress = 100;
  console.log('\n✅ ALL PROCESSING COMPLETE\n');
}

async function pollDashScopeTask(taskId, apiKey, chunkNum, totalChunks) {
  let attempts = 0;
  const maxAttempts = 120;
  
  while (attempts < maxAttempts) {
    try {
      const response = await axios.get(
        `${DASHSCOPE_TASK_ENDPOINT}/${taskId}`,
        {
          headers: {
            'Authorization': `Bearer ${apiKey}`
          }
        }
      );

      const { task_status, results } = response.data.output;
      console.log(`   [Chunk ${chunkNum}] Status: ${task_status}`);

      if (task_status === 'SUCCEEDED') {
        return results.video_url;
      } else if (task_status === 'FAILED') {
        throw new Error(`Task failed: ${response.data.output.message || 'Unknown error'}`);
      } else if (task_status === 'CANCELED') {
        throw new Error('Task was canceled');
      }

      await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));
      attempts++;
      
    } catch (error) {
      if (error.response && error.response.status === 404) {
        throw new Error(`Task not found: ${taskId}`);
      }
      throw error;
    }
  }

  throw new Error(`Task timed out`);
}

// Export as Firebase Cloud Function
exports.api = functions.https.onRequest(app);

