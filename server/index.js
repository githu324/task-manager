const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// ---------- Supabase 客户端 ----------
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

let supabase = null;
if (SUPABASE_URL && SUPABASE_ANON_KEY) {
  const { createClient } = require('@supabase/supabase-js');
  supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
} else {
  console.warn('[警告] 未配置 SUPABASE_URL / SUPABASE_ANON_KEY，接口将返回 503。请在 .env 中填写 Supabase 凭据。');
}

const PRIORITIES = ['高', '中', '低'];

function requireSupabase(req, res, next) {
  if (!supabase) {
    return res.status(503).json({
      error: '数据库未配置：缺少 SUPABASE_URL 或 SUPABASE_ANON_KEY，请在 .env 或部署环境变量中配置后重启。'
    });
  }
  next();
}

// ---------- 接口 ----------

// 查询任务列表（按创建时间倒序，可按优先级筛选）
app.get('/api/tasks', requireSupabase, async (req, res) => {
  const { priority } = req.query;
  let query = supabase
    .from('tasks')
    .select('id, title, priority, completed, created_at')
    .order('created_at', { ascending: false });

  if (priority && PRIORITIES.includes(priority)) {
    query = query.eq('priority', priority);
  }

  const { data, error } = await query;
  if (error) {
    return res.status(500).json({ error: error.message });
  }
  res.json(data);
});

// 添加任务
app.post('/api/tasks', requireSupabase, async (req, res) => {
  const { title, priority } = req.body || {};
  const trimmedTitle = (title || '').trim();

  if (!trimmedTitle) {
    return res.status(400).json({ error: '任务标题不能为空' });
  }
  const finalPriority = PRIORITIES.includes(priority) ? priority : '中';

  const { data, error } = await supabase
    .from('tasks')
    .insert({ title: trimmedTitle, priority: finalPriority })
    .select('id, title, priority, completed, created_at')
    .single();

  if (error) {
    return res.status(500).json({ error: error.message });
  }
  res.status(201).json(data);
});

// 切换完成 / 未完成
app.patch('/api/tasks/:id/toggle', requireSupabase, async (req, res) => {
  const { id } = req.params;

  const { data: current, error: fetchErr } = await supabase
    .from('tasks')
    .select('completed')
    .eq('id', id)
    .single();

  if (fetchErr) {
    return res.status(404).json({ error: '任务不存在或查询失败：' + fetchErr.message });
  }

  const { data, error } = await supabase
    .from('tasks')
    .update({ completed: !current.completed })
    .eq('id', id)
    .select('id, title, priority, completed, created_at')
    .single();

  if (error) {
    return res.status(500).json({ error: error.message });
  }
  res.json(data);
});

// 删除任务
app.delete('/api/tasks/:id', requireSupabase, async (req, res) => {
  const { id } = req.params;
  const { error } = await supabase.from('tasks').delete().eq('id', id);

  if (error) {
    return res.status(500).json({ error: error.message });
  }
  res.status(204).end();
});

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({ ok: true, configured: !!supabase });
});

// ---------- 静态前端 ----------
app.use(express.static(path.join(__dirname, '..', 'public')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`智能任务管理系统已启动：http://localhost:${PORT}`);
});
