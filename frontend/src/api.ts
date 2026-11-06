const BASE = "/api";

const token = () => localStorage.getItem("token");

async function request<T = any>(path: string, opts: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(opts.headers as Record<string, string>),
  };
  const t = token();
  if (t) headers["Authorization"] = `Bearer ${t}`;
  const res = await fetch(BASE + path, { ...opts, headers });
  if (res.status === 401) {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    if (!window.location.pathname.startsWith("/login")) window.location.href = "/login";
    throw new Error("登录已过期");
  }
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.detail || `请求失败（HTTP ${res.status}）`);
  }
  return res.json();
}

export const api = {
  get: <T = any>(p: string) => request<T>(p),
  post: <T = any>(p: string, body?: any) => request<T>(p, { method: "POST", body: JSON.stringify(body ?? {}) }),
  put: <T = any>(p: string, body?: any) => request<T>(p, { method: "PUT", body: JSON.stringify(body ?? {}) }),
  del: <T = any>(p: string, body?: any) => request<T>(p, { method: "DELETE", body: JSON.stringify(body ?? {}) }),
};

// ---------- 公共类型 ----------
export interface User {
  id: number;
  username: string;
  name: string;
  role: string;
}

export interface Course {
  id: number;
  name: string;
  description?: string | null;
  teacher_id: number;
  teacher_name?: string | null;
  assignment_weight: number;
  student_count: number;
  is_enrolled?: boolean;
}

export interface Question {
  id: number;
  course_id: number;
  type: string;
  difficulty: number;
  knowledge_point?: string | null;
  content: any;
  source: string;
  created_at: string;
}

export interface Exam {
  id: number;
  course_id: number;
  title: string;
  kind: string;
  status: string;
  duration_minutes?: number | null;
  deadline?: string | null;
  total_score: number;
  question_count: number;
  created_at: string;
  published_at?: string | null;
  my_submission_status?: string;
  my_total_score?: number;
}

export const QUESTION_TYPES: Record<string, string> = {
  single_choice: "单选题",
  multi_choice: "多选题",
  true_false: "判断题",
  fill_blank: "填空题",
  short_answer: "简答题",
};

export const DIFFICULTY: Record<number, string> = {
  1: "很易",
  2: "较易",
  3: "中等",
  4: "较难",
  5: "很难",
};

export const STATUS_LABEL: Record<string, { text: string; color: string }> = {
  draft: { text: "草稿", color: "default" },
  published: { text: "进行中", color: "processing" },
  closed: { text: "已关闭", color: "default" },
  in_progress: { text: "作答中", color: "processing" },
  submitted: { text: "待批阅", color: "warning" },
  graded: { text: "已批阅", color: "success" },
};

export const KIND_LABEL: Record<string, string> = {
  exam: "考试",
  assignment: "作业",
};