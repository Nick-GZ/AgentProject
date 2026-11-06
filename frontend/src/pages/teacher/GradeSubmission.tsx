import { useCallback, useEffect, useState } from "react";
import {
  Alert, Button, Card, Descriptions, Input, InputNumber, Popconfirm, Space, Tag, message,
} from "antd";
import { ArrowLeftOutlined, CheckCircleOutlined, RobotOutlined } from "@ant-design/icons";
import { useNavigate, useParams } from "react-router-dom";
import { api, QUESTION_TYPES, KIND_LABEL, STATUS_LABEL } from "../../api";
import { AnswerDisplay, QuestionCard, QuestionHeader } from "../../components/QuestionViews";
import dayjs from "dayjs";

export default function GradeSubmission() {
  const { subId } = useParams();
  const subID = Number(subId);
  const nav = useNavigate();
  const [sub, setSub] = useState<any>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [drafts, setDrafts] = useState<Record<number, { score: number; feedback: string }>>({});

  const load = useCallback(async () => {
    try {
      setSub(await api.get(`/submissions/${subID}`));
    } catch (e: any) {
      message.error(e.message);
    }
  }, [subID]);

  useEffect(() => {
    load();
  }, [load]);

  const runAi = async () => {
    setAiBusy(true);
    try {
      const { task_id } = await api.post(`/submissions/${subID}/grade-ai`);
      for (let i = 0; i < 60; i++) {
        await new Promise((r) => setTimeout(r, 1000));
        const t = await api.get(`/ai/tasks/${task_id}`);
        if (t.status === "success") {
          message.success(`AI 批阅完成 ${t.result.graded_count} 题（${t.result.llm_mode === "real" ? "大模型" : "模拟模式"}），请复核`);
          load();
          return;
        }
        if (t.status === "failed") throw new Error(t.error || "AI 批阅失败");
      }
      throw new Error("AI 批阅超时");
    } catch (e: any) {
      message.error(e.message);
    } finally {
      setAiBusy(false);
    }
  };

  const saveGrading = async (gradingId: number) => {
    const d = drafts[gradingId];
    if (!d) return;
    try {
      await api.put(`/gradings/${gradingId}`, { score: d.score, feedback: d.feedback });
      message.success("复核已保存");
      load();
    } catch (e: any) {
      message.error(e.message);
    }
  };

  const finalize = async () => {
    try {
      await api.post(`/submissions/${subID}/finalize`);
      message.success("已定稿");
      load();
    } catch (e: any) {
      message.error(e.message);
    }
  };

  if (!sub) return <div>加载中…</div>;

  const pending = sub.items.filter((i: any) => i.grading?.score == null);

  return (
    <div>
      <Space style={{ marginBottom: 16, width: "100%", justifyContent: "space-between" }}>
        <Space>
          <Button icon={<ArrowLeftOutlined />} onClick={() => nav(`/teacher/exam/${sub.exam_id}/submissions`)}>
            返回答卷列表
          </Button>
          <h2 style={{ margin: 0 }}>{sub.exam_title} — {sub.student_name} 的答卷</h2>
          <Tag color={STATUS_LABEL[sub.status]?.color}>{STATUS_LABEL[sub.status]?.text}</Tag>
        </Space>
        <Space>
          <Button type="primary" icon={<RobotOutlined />} loading={aiBusy} onClick={runAi} disabled={pending.length === 0 && sub.status === "graded"}>
            AI 批阅主观题
          </Button>
          <Popconfirm title="定稿后成绩即生效，未批阅的题目按 0 分计。确认？" onConfirm={finalize}>
            <Button icon={<CheckCircleOutlined />} disabled={sub.status === "graded"}>定稿</Button>
          </Popconfirm>
        </Space>
      </Space>

      <Card size="small" style={{ marginBottom: 16 }}>
        <Descriptions size="small" column={4}>
          <Descriptions.Item label="类型">{KIND_LABEL[sub.kind]}</Descriptions.Item>
          <Descriptions.Item label="总分">
            {sub.status === "graded" ? <Tag color="green">{sub.total_score}</Tag> : "—"}
          </Descriptions.Item>
          <Descriptions.Item label="交卷时间">
            {sub.submitted_at ? dayjs(sub.submitted_at).format("YYYY-MM-DD HH:mm") : "未交"}
          </Descriptions.Item>
          <Descriptions.Item label="待批阅">{pending.length} 题</Descriptions.Item>
        </Descriptions>
      </Card>

      {sub.items.map((item: any, idx: number) => (
        <QuestionCard key={item.question_id}>
          <QuestionHeader q={item} index={idx} />
          <div style={{ whiteSpace: "pre-wrap", marginBottom: 10 }}>{item.content?.stem}</div>

          {item.type !== "short_answer" ? (
            <AnswerDisplay q={item} value={item.student_answer} />
          ) : (
            <div style={{ whiteSpace: "pre-wrap", background: "#fafafa", padding: 10, borderRadius: 6, marginBottom: 10 }}>
              <b>学生答案：</b>
              {item.student_answer || "（未作答）"}
            </div>
          )}

          {item.reference && (
            <div style={{ whiteSpace: "pre-wrap", color: "#888", background: "#f0f5ff", padding: 10, borderRadius: 6, marginBottom: 10 }}>
              <b>参考答案：</b>{item.reference}
              {item.rubric && <div style={{ marginTop: 4 }}><b>评分标准：</b>{item.rubric}</div>}
            </div>
          )}

          {item.grading && (
            <div style={{ display: "flex", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 260 }}>
                <div style={{ marginBottom: 6 }}>
                  <b>批注：</b>
                  <Input.TextArea
                    rows={2}
                    value={drafts[item.grading.id]?.feedback ?? item.grading.feedback ?? ""}
                    onChange={(e) =>
                      setDrafts({
                        ...drafts,
                        [item.grading.id]: {
                          score: drafts[item.grading.id]?.score ?? item.grading.score ?? item.max_score,
                          feedback: e.target.value,
                        },
                      })
                    }
                  />
                </div>
                <Space>
                  <span>
                    <b>得分：</b>
                    <InputNumber
                      min={0}
                      max={item.max_score}
                      step={0.5}
                      value={drafts[item.grading.id]?.score ?? item.grading.score ?? 0}
                      onChange={(v) =>
                        setDrafts({
                          ...drafts,
                          [item.grading.id]: {
                            score: v,
                            feedback: drafts[item.grading.id]?.feedback ?? item.grading.feedback ?? "",
                          },
                        })
                      }
                      style={{ width: 90 }}
                    />
                    <span style={{ color: "#888" }}> / {item.max_score}</span>
                  </span>
                  {item.grading.reviewed ? (
                    <Tag color="success">已复核</Tag>
                  ) : (
                    <Tag color={item.grading.graded_by === "ai" ? "purple" : item.grading.graded_by === "auto" ? "blue" : "default"}>
                      {item.grading.graded_by === "ai" ? "AI 批阅" : item.grading.graded_by === "auto" ? "自动判分" : "待批阅"}
                    </Tag>
                  )}
                  <Button
                    type="primary"
                    size="small"
                    onClick={() => saveGrading(item.grading.id)}
                    disabled={!drafts[item.grading.id]}
                  >
                    保存复核
                  </Button>
                </Space>
              </div>
            </div>
          )}
        </QuestionCard>
      ))}
    </div>
  );
}