// TaskHub 邀请码后端服务
// 部署: npm install && npm start
// 端口: process.env.PORT || 3000

const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const app = express();

app.use(cors());
app.use(express.json());

// Serve frontend HTML - try project root first, fall back to public/
app.use(express.static('.', { index: 'index.html' }));
app.use(express.static('public', { index: 'index.html' }));

// 邀请码配置（管理员在此配置）
// 格式: { code: "xxx", expiry: "2026-12-31", maxUses: 1 }
const INVITE_CODES = [
  { code: "TASK2024", expiry: "2026-12-31", maxUses: 1 },
  { code: "WORKHUB",  expiry: null,        maxUses: 1 },
];

// 内存存储: 记录每个邀请码的使用情况
// codeUsed[code] = { usedAt: ISO时间, deviceToken: "xxx" }
const codeUsed = {};
// Admin-generated invite codes (persisted to JSON)
let adminInvites = [];

// 恢复之前的数据
try {
  if (require('fs').existsSync('./codeUsed.json')) {
    const data = JSON.parse(require('fs').readFileSync('./codeUsed.json', 'utf8'));
    if (data._used) Object.assign(codeUsed, data._used);
    if (data._adminInvites) adminInvites = data._adminInvites;
  }
} catch(e) {}

function saveUsage() {
  try {
    require('fs').writeFileSync('./codeUsed.json', JSON.stringify({ _used: codeUsed, _adminInvites: adminInvites }, null, 2));
  } catch(e) {}
}

// Get all valid invite codes (embedded + admin-added)
function getAllInvites() {
  return [...INVITE_CODES, ...adminInvites];
}

// API: 验证邀请码
app.post('/api/verify', (req, res) => {
  const { code } = req.body;
  if (!code) return res.json({ ok: false, error: '请输入邀请码' });

  const inv = getAllInvites().find(i => i.code.toUpperCase() === code.toUpperCase());
  if (!inv) return res.json({ ok: false, error: '邀请码无效' });

  // 检查是否过期
  if (inv.expiry && new Date(inv.expiry) < new Date()) {
    return res.json({ ok: false, error: '邀请码已过期' });
  }

  // 检查是否已被使用
  const key = code.toUpperCase();
  if (codeUsed[key]) {
    return res.json({ ok: false, error: '该邀请码已被使用' });
  }

  // 标记为已使用
  const deviceToken = crypto.randomBytes(16).toString('hex');
  codeUsed[key] = { usedAt: new Date().toISOString(), deviceToken };
  saveUsage();

  res.json({ ok: true, token: deviceToken, msg: '验证成功' });
});

// API: 管理员查看邀请码状态
app.get('/api/invites', (req, res) => {
  const adminKey = req.headers['x-admin-key'];
  if (adminKey !== 'admin888') return res.json({ ok: false, error: '无权限' });

  const list = getAllInvites().map(inv => {
    const key = inv.code.toUpperCase();
    return { code: inv.code, expiry: inv.expiry, used: !!codeUsed[key], usedAt: codeUsed[key] ? codeUsed[key].usedAt : null, adminAdded: adminInvites.some(a => a.code === inv.code) };
  });
  res.json({ ok: true, list });
});

// API: 管理员添加邀请码
app.post('/api/invites/add', (req, res) => {
  const adminKey = req.headers['x-admin-key'];
  if (adminKey !== 'admin888') return res.json({ ok: false, error: '无权限' });
  const { code, expiry } = req.body;
  if (!code) return res.json({ ok: false, error: '请输入邀请码' });
  const key = code.toUpperCase();
  if (getAllInvites().find(i => i.code.toUpperCase() === key)) return res.json({ ok: false, error: '邀请码已存在' });
  adminInvites.push({ code: key, expiry: expiry || null, maxUses: 1 });
  saveUsage();
  res.json({ ok: true, msg: '已生成: ' + key });
});

// API: 管理员删除邀请码
app.post('/api/invites/delete', (req, res) => {
  const adminKey = req.headers['x-admin-key'];
  if (adminKey !== 'admin888') return res.json({ ok: false, error: '无权限' });
  const { code } = req.body;
  if (!code) return res.json({ ok: false, error: '缺少邀请码' });
  const key = code.toUpperCase();
  const idx = adminInvites.findIndex(i => i.code.toUpperCase() === key);
  if (idx >= 0) { adminInvites.splice(idx, 1); saveUsage(); return res.json({ ok: true }); }
  // Check embedded codes
  const embIdx = INVITE_CODES.findIndex(i => i.code.toUpperCase() === key);
  if (embIdx >= 0) return res.json({ ok: false, error: '内置邀请码不可删除' });
  res.json({ ok: false, error: '邀请码不存在' });
});

// 健康检查
app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

// Fallback: serve index.html for / route
app.get('/', (req, res) => {
  var path = require('path');
  var fs = require('fs');
  var publicIndex = path.join(__dirname, 'public', 'index.html');
  var rootIndex = path.join(__dirname, 'index.html');
  if (fs.existsSync(publicIndex)) { res.sendFile(publicIndex); }
  else if (fs.existsSync(rootIndex)) { res.sendFile(rootIndex); }
  else { res.status(404).send('index.html not found'); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('TaskHub Server running on port ' + PORT));
