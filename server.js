// TaskHub 邀请码后端服务
// 部署: npm install && npm start
// 端口: process.env.PORT || 3000

const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static('public'));  // Serve frontend HTML

// 邀请码配置（管理员在此配置）
// 格式: { code: "xxx", expiry: "2026-12-31", maxUses: 1 }
const INVITE_CODES = [
  { code: "TASK2024", expiry: "2026-12-31", maxUses: 1 },
  { code: "WORKHUB",  expiry: null,        maxUses: 1 },
];

// 内存存储: 记录每个邀请码的使用情况
// codeUsed[code] = { usedAt: ISO时间, deviceToken: "xxx" }
const codeUsed = {};

// 恢复之前的使用记录（进程重启后会丢失，适合轻量场景）
try {
  if (require('fs').existsSync('./codeUsed.json')) {
    Object.assign(codeUsed, JSON.parse(require('fs').readFileSync('./codeUsed.json', 'utf8')));
  }
} catch(e) {}

function saveUsage() {
  try {
    require('fs').writeFileSync('./codeUsed.json', JSON.stringify(codeUsed, null, 2));
  } catch(e) {}
}

// API: 验证邀请码
app.post('/api/verify', (req, res) => {
  const { code } = req.body;
  if (!code) return res.json({ ok: false, error: '请输入邀请码' });

  const inv = INVITE_CODES.find(i => i.code.toUpperCase() === code.toUpperCase());
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

  const list = INVITE_CODES.map(inv => {
    const key = inv.code.toUpperCase();
    return { code: inv.code, expiry: inv.expiry, maxUses: inv.maxUses, used: !!codeUsed[key], usedAt: codeUsed[key] ? codeUsed[key].usedAt : null };
  });
  res.json({ ok: true, list });
});

// 健康检查
app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('TaskHub Server running on port ' + PORT));
