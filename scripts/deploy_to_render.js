const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');

const RENDER_API_KEY = 'rnd_oJy0ejXHznUcvXuuC77krne02e45';
const OWNER_ID = 'tea-cv27me0gph6c73bdk33g';
const GITHUB_USERNAME = 'yusufjonov1611';
const REPO_NAME = 'harajat-bot';

// Get GitHub Token
let GITHUB_TOKEN = '';
try {
  GITHUB_TOKEN = execSync('powershell -ExecutionPolicy Bypass -File scripts/get_token.ps1').toString().trim();
} catch (e) {
  console.error('GitHub tokenni olishda xatolik:', e.message);
  process.exit(1);
}

console.log('✅ GitHub Token topildi:', GITHUB_TOKEN.substring(0, 7) + '...');
console.log('✅ Render API Key tayyor:', RENDER_API_KEY.substring(0, 8) + '...');

function httpsRequest(options, postData = null) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          resolve({ status: res.statusCode, headers: res.headers, data: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, headers: res.headers, raw: body });
        }
      });
    });
    req.on('error', reject);
    if (postData) {
      req.write(typeof postData === 'string' ? postData : JSON.stringify(postData));
    }
    req.end();
  });
}

async function githubRequest(endpoint, method = 'GET', data = null) {
  const options = {
    hostname: 'api.github.com',
    path: endpoint,
    method: method,
    headers: {
      'User-Agent': 'NodeJS-Deployer',
      'Authorization': `token ${GITHUB_TOKEN}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json'
    }
  };
  return httpsRequest(options, data);
}

async function renderRequest(endpoint, method = 'GET', data = null) {
  const options = {
    hostname: 'api.render.com',
    path: `/v1${endpoint}`,
    method: method,
    headers: {
      'Authorization': `Bearer ${RENDER_API_KEY}`,
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    }
  };
  return httpsRequest(options, data);
}

async function ensureGitHubRepo() {
  console.log(`\n🔍 GitHubda ${GITHUB_USERNAME}/${REPO_NAME} repozitoriyasini tekshirish...`);
  const check = await githubRequest(`/repos/${GITHUB_USERNAME}/${REPO_NAME}`);
  if (check.status === 200) {
    console.log(`✅ Repozitoriya allaqachon mavjud: ${check.data.html_url}`);
    return check.data;
  }

  console.log(`📦 Yangi repozitoriya ochilmoqda: ${REPO_NAME}...`);
  const createRes = await githubRequest('/user/repos', 'POST', {
    name: REPO_NAME,
    description: 'Harajatlarni teng taqsimlash va hisob-kitob qilish Web App & Telegram bot',
    private: false,
    auto_init: true
  });

  if (createRes.status === 201) {
    console.log(`✅ Repozitoriya muvaffaqiyatli ochildi: ${createRes.data.html_url}`);
    return createRes.data;
  } else {
    throw new Error(`Repozitoriya ochib bo'lmadi: ${JSON.stringify(createRes.data)}`);
  }
}

async function uploadFileToGitHub(filePathInRepo, localFilePath) {
  const content = fs.readFileSync(localFilePath);
  const contentB64 = content.toString('base64');

  // Check if file already exists in repo to get SHA
  const check = await githubRequest(`/repos/${GITHUB_USERNAME}/${REPO_NAME}/contents/${filePathInRepo}`);
  const sha = check.status === 200 ? check.data.sha : null;

  const payload = {
    message: `Add/Update ${filePathInRepo}`,
    content: contentB64,
    branch: 'main'
  };
  if (sha) payload.sha = sha;

  const res = await githubRequest(`/repos/${GITHUB_USERNAME}/${REPO_NAME}/contents/${filePathInRepo}`, 'PUT', payload);
  if (res.status === 200 || res.status === 201) {
    console.log(`  ✓ Yuklandi: ${filePathInRepo}`);
  } else {
    console.error(`  ✗ Xatolik: ${filePathInRepo}`, res.data?.message || res.status);
  }
}

async function uploadProjectFiles() {
  console.log('\n📤 Loyiha fayllarini GitHub repozitoriyasiga yuklash...');
  const filesToUpload = [
    { repoPath: 'package.json', local: 'package.json' },
    { repoPath: 'README.md', local: 'README.md' },
    { repoPath: 'render.yaml', local: 'render.yaml' },
    { repoPath: 'Dockerfile', local: 'Dockerfile' },
    { repoPath: '.gitignore', local: '.gitignore' },
    { repoPath: 'src/server.js', local: 'src/server.js' },
    { repoPath: 'src/bot.js', local: 'src/bot.js' },
    { repoPath: 'src/calculator.js', local: 'src/calculator.js' },
    { repoPath: 'src/parser.js', local: 'src/parser.js' },
    { repoPath: 'src/storage.js', local: 'src/storage.js' },
    { repoPath: 'public/index.html', local: 'public/index.html' }
  ];

  for (const f of filesToUpload) {
    const fullLocal = path.join(__dirname, '..', f.local);
    if (fs.existsSync(fullLocal)) {
      await uploadFileToGitHub(f.repoPath, fullLocal);
    }
  }
}

async function deployToRender() {
  console.log('\n🚀 Render.com serverida Web Service ni tekshirish/yaratish...');
  
  // List current services
  const listRes = await renderRequest('/services?limit=50');
  let existingService = null;

  if (listRes.status === 200 && Array.isArray(listRes.data)) {
    for (const item of listRes.data) {
      if (item.service?.name === 'harajat-bot' || item.service?.repo?.includes(REPO_NAME)) {
        existingService = item.service;
        break;
      }
    }
  }

  if (existingService) {
    console.log(`✅ Renderda xizmat allaqachon mavjud: ${existingService.name} (${existingService.id})`);
    console.log(`🌐 Jonli URL: ${existingService.serviceDetails?.url}`);
    
    // Trigger deploy
    console.log('🔄 Yangi o\'zgarishlar bilan deploy qilinmoqda...');
    const depRes = await renderRequest(`/services/${existingService.id}/deploys`, 'POST', {
      clearCache: 'do_not_clear'
    });
    console.log(`✅ Deploy boshlandi! Deploy ID: ${depRes.data?.id}`);
    return existingService;
  }

  // Create new Web Service on Render
  console.log('✨ Renderda yangi Web Service yaratilmoqda...');
  const createPayload = {
    type: 'web_service',
    name: 'harajat-bot',
    ownerId: OWNER_ID,
    repo: `https://github.com/yusufjonov1611/${REPO_NAME}`,
    branch: 'main',
    autoDeploy: 'yes',
    serviceDetails: {
      env: 'node',
      plan: 'free',
      region: 'frankfurt',
      envSpecificDetails: {
        buildCommand: 'npm install',
        startCommand: 'node src/server.js'
      },
      envVars: [
        { key: 'PORT', value: '3000' }
      ]
    }
  };

  const createRes = await renderRequest('/services', 'POST', createPayload);
  if (createRes.status === 201) {
    const srv = createRes.data;
    console.log(`🎉 Web Service yaratildi! ID: ${srv.id}`);
    console.log(`🌐 Jonli URL: ${srv.serviceDetails?.url}`);
    return srv;
  } else {
    throw new Error(`Renderda servis yaratib bo'lmadi: ${JSON.stringify(createRes.data)}`);
  }
}

async function main() {
  try {
    await ensureGitHubRepo();
    await uploadProjectFiles();
    const service = await deployToRender();

    console.log('\n======================================================');
    console.log('🎉 TABRIKLAYMIZ! HARAJAT WEB APP SERVERGA JOYLASHDI!');
    console.log(`🌐 Internetdagi doimiy manzili (URL):`);
    console.log(`   👉 ${service.serviceDetails?.url || 'https://harajat-bot.onrender.com'}`);
    console.log('======================================================');
  } catch (err) {
    console.error('Xatolik yuz berdi:', err);
  }
}

main();
