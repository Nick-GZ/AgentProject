import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert, Button, Card, Modal, Space, Spin, Statistic, Tag, message,
} from "antd";
import { ClockCircleOutlined } from "@ant-design/icons";
import { useNavigate, useParams } from "react-router-dom";
import { api, KIND_LABEL } from "../../api";
import { QuestionAnswerInput, QuestionCard, QuestionHeader } from "../../components/QuestionViews";
import dayjs from "dayjs";

export default function TakeExam() {
  const { examId } = useParams();
  const examID = Number(examId);
  const nav = useNavigate();
  const [paper, setPaper] = useState<any>(null);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [now, setNow] = useState(Date.now());
  const [saving, setSaving] = useState(false);
  const saveTimer = useRef<any>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // 取卷
  useEffect(() => {
    (async () => {
      try {
        const p = await api.get(`/exams/${examID}/paper`);
        if (p.submitted) {
          message.warning("你已提交过该试卷");
          nav(`/student/submission/${p.submission_id}`, { replace: true });
          return;
        }
        setPaper(p);
        setAnswers(p.answers || {});
      } catch (e: any) {
        message.error(e.message);
        nav("/student", { replace: true });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [examID]);

  // 倒计时
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // 自动保存（防抖 3 秒）
  useEffect(() => {
    if (!paper || Object.keys(answers).length === 0) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      setSaving(true);
      try {
        await api.put(`/exams/${examID}/progress`, { answers });
      } catch {
        /* 忽略自动保存错误 */
      } finally {
        setSaving(false);
      }
    }, 3000);
    return () => clearTimeout(saveTimer.current);
  }, [answers, examID, paper]);

  // 截止时间
  const deadlineMs = useMemo(() => {
    if (!paper) return null;
    if (paper.exam.kind === "assignment" && paper.exam.deadline)
      return new Date(paper.exam.deadline).getTime();
    if (paper.exam.kind === "exam" && paper.exam.duration_minutes)
      return new Date(paper.started_at).getTime() + paper.exam.duration_minutes * 60 * 1000;
    return null;
  }, [paper]);

  const remainingMs = deadlineMs ? Math.max(0, deadlineMs - now) : null;

  // 时间到自动交卷
  useEffect(() => {
    if (remainingMs === 0 && paper && !submittedRef.current) {
      doSubmit(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remainingMs]);

  const submittedRef = useRef(false);

  const unanswered = paper ? paper.questions.filter((q: any) => answers[q.question_id] == null || answers[q.question_id] === "").length : 0;

  const doSubmit = async (auto = false) => {
    if (submittedRef.current) return;
    submittedRef.current = true;
    setSubmitting(true);
    setConfirmOpen(false);
    try {
      const r = await api.post(`/exams/${examID}/submit`, { answers });
      message.success(auto ? "考试时间到，已自动交卷" : "交卷成功");
      nav(`/student/submission/${r.submission_id}`, { replace: true });
    } catch (e: any) {
      submittedRef.current = false;
      setSubmitting(false);
      message.error(e.message);
    }
  };

  if (!paper) return <Spin style={{ display: "block", marginTop: 100 }} size="large" />;

  const fmt = (ms: number) => {
    const s = Math.floor(ms / 1000);
    return `${String(Math.floor(s / 3600)).padStart(2, "0")}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  };

  return (
    <div style={{ maxWidth: 900, margin: "0 auto" }}>
      <Card style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
          <div>
            <h2 style={{ margin: 0 }}>
              {paper.exam.title} <Tag>{KIND_LABEL[paper.exam.kind]}</Tag>
            </h2>
            <span style={{ color: "#888" }}>
              共 {paper.questions.length} 题 · 满分 {paper.exam.total_score} 分
              {paper.exam.course_name ? "" : ""}
            </span>
          </div>
          <Space direction="vertical" align="end">
            {remainingMs != null && (
              <Statistic
                title={paper.exam.kind === "exam" ? "剩余时间" : "距截止时间"}
                value={fmt(remainingMs)}
                prefix={<ClockCircleOutlined />}
                valueStyle={{ color: remainingMs < 5 * 60 * 1000 ? "#cf1322" : undefined, fontSize: 20 }}
              />
            )}
            <span style={{ color: saving ? "#1677ff" : "#bbb", fontSize: 12 }}>
              {saving ? "正在自动保存…" : "自动保存已开启"}
            </span>
          </Space>
        </div>
      </Card>

      {paper.questions.map((q: any, idx: number) => (
        <QuestionCard key={q.question_id}>
          <QuestionHeader q={q} index={idx} />
          <QuestionAnswerInput
            q={q}
            value={answers[q.question_id]}
            onChange={(v) => setAnswers((a) => ({ ...a, [q.question_id]: v }))}
          />
        </QuestionCard>
      ))}

      <div style={{ textAlign: "center", marginBottom: 60 }}>
        <Button
          type="primary"
          size="large"
          loading={submitting}
          onClick={() => (unanswered > 0 ? setConfirmOpen(true) : doSubmit())}
        >
          交卷
        </Button>
      </div>

      <Modal
        open={confirmOpen}
        title="确认交卷"
        okText="交卷"
        cancelText="继续作答"
        onOk={() => doSubmit()}
        onCancel={() => setConfirmOpen(false)}
        confirmLoading={submitting}
      >
        <Alert
          type="warning"
          showIcon
          message={`还有 ${unanswered} 题未作答，未作答题目将计 0 分。`}
          description="交卷后答案不可修改，确认要交卷吗？"
        />
      </Modal>
    </div>
  );
}