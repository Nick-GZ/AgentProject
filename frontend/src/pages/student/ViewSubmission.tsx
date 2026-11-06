import { useEffect, useState } from "react";
import { Button, Card, Descriptions, Spin, Tag, message } from "antd";
import { ArrowLeftOutlined } from "@ant-design/icons";
import { useNavigate, useParams } from "react-router-dom";
import { api, KIND_LABEL, STATUS_LABEL } from "../../api";
import { QuestionCard, QuestionHeader } from "../../components/QuestionViews";
import dayjs from "dayjs";

export default function ViewSubmission() {
  const { subId } = useParams();
  const subID = Number(subId);
  const nav = useNavigate();
  const [sub, setSub] = useState<any>(null);

  useEffect(() => {
    (async () => {
      try {
        setSub(await api.get(`/submissions/${subID}`));
      } catch (e: any) {
        message.error(e.message);
        nav("/student", { replace: true });
      }
    })();
  }, [subID, nav]);

  if (!sub) return <Spin size="large" style={{ display: "block", margin: 100 }} />;

  const renderAnswer = (item: any) => {
    const c = item.content || {};
    const v = item.student_answer;
    if (item.type === "single_choice")
      return v == null ? "未作答" : `${String.fromCharCode(65 + v)}. ${c.options?.[v]}`;
    if (item.type === "multi_choice")
      return !v?.length ? "未作答" : v.map((i: number) => String.fromCharCode(65 + i)).join("、");
    if (item.type === "true_false") return v == null ? "未作答" : v ? "正确" : "错误";
    if (item.type === "fill_blank") return v ?? "未作答";
    return v || "未作答";
  };

  const renderScore = (item: any) => {
    const g = item.grading;
    if (!g || g.score == null) return <Tag color="default">待批阅</Tag>;
    const color = g.score >= item.max_score ? "success" : g.score > 0 ? "orange" : "error";
    return <Tag color={color}>{g.score} / {item.max_score}</Tag>;
  };

  return (
    <div style={{ maxWidth: 900, margin: "0 auto" }}>
      <div style={{ marginBottom: 16 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => nav("/student")}>
          返回学习中心
        </Button>
      </div>
      <Card size="small" style={{ marginBottom: 16 }}>
        <Descriptions size="small" column={3}>
          <Descriptions.Item label="项目">{sub.exam_title}</Descriptions.Item>
          <Descriptions.Item label="类型">{KIND_LABEL[sub.kind]}</Descriptions.Item>
          <Descriptions.Item label="状态">
            <Tag color={STATUS_LABEL[sub.status]?.color}>{STATUS_LABEL[sub.status]?.text}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label="总分">
            {sub.total_score != null ? <Tag color="green">{sub.total_score}</Tag> : "—"}
          </Descriptions.Item>
          <Descriptions.Item label="交卷时间">
            {sub.submitted_at ? dayjs(sub.submitted_at).format("YYYY-MM-DD HH:mm") : "—"}
          </Descriptions.Item>
        </Descriptions>
      </Card>

      {sub.status !== "graded" && (
        <Card size="small" style={{ marginBottom: 16 }}>
          <Tag color="warning">该答卷正在等待教师批阅，批阅完成后可查看各题得分与批注</Tag>
        </Card>
      )}

      {sub.items.map((item: any, idx: number) => (
        <QuestionCard key={item.question_id}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
            <QuestionHeader q={item} index={idx} />
            {renderScore(item)}
          </div>
          <div style={{ whiteSpace: "pre-wrap", marginBottom: 10 }}>{item.content?.stem}</div>
          <div
            style={{
              whiteSpace: "pre-wrap",
              background: "#fafafa",
              padding: 10,
              borderRadius: 6,
              marginBottom: item.grading?.feedback ? 10 : 0,
            }}
          >
            <b>我的答案：</b>
            {renderAnswer(item)}
          </div>
          {item.grading?.feedback && (
            <div style={{ whiteSpace: "pre-wrap", background: "#f0f5ff", padding: 10, borderRadius: 6 }}>
              <b>批阅意见：</b>
              {item.grading.feedback}
            </div>
          )}
        </QuestionCard>
      ))}
    </div>
  );
}