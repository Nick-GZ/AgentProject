import { useEffect, useState } from "react";
import {
  Alert, Button, Card, Col, Divider, Form, Input, InputNumber, message, Modal,
  Popconfirm, Row, Select, Space, Table, Tag,
} from "antd";
import {
  ArrowLeftOutlined, DeleteOutlined, PlusOutlined, RobotOutlined, SaveOutlined,
  PlayCircleOutlined, StopOutlined,
} from "@ant-design/icons";
import { useNavigate, useParams } from "react-router-dom";
import {
  api, Exam, QUESTION_TYPES, KIND_LABEL, STATUS_LABEL,
} from "../../api";

export default function ExamEditor() {
  const { examId } = useParams();
  const examID = Number(examId);
  const nav = useNavigate();
  const [exam, setExam] = useState<any>(null);
  const [bank, setBank] = useState<any[]>([]);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiForm] = Form.useForm();
  const [metaForm] = Form.useForm();

  const load = async () => {
    try {
      const e = await api.get(`/exams/${examID}`);
      setExam(e);
      metaForm.setFieldsValue({
        title: e.title,
        duration_minutes: e.duration_minutes,
        deadline: e.deadline ? e.deadline.replace("T", " ").slice(0, 16) : null,
      });
      const bankQs = await api.get(`/courses/${e.course_id}/questions`);
      setBank(bankQs);
    } catch (e: any) {
      message.error(e.message);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [examID]);

  const isDraft = exam?.status === "draft";
  const selectedIds = new Set((exam?.questions || []).map((q: any) => q.question_id));

  const toggleQuestion = (q: any) => {
    const items = [...(exam.questions || [])];
    const idx = items.findIndex((i: any) => i.question_id === q.id);
    if (idx >= 0) items.splice(idx, 1);
    else items.push({ question_id: q.id, score: 5, type: q.type, seq: items.length });
    setExam({ ...exam, questions: items });
  };

  const setScore = (qid: number, score: number) => {
    setExam({
      ...exam,
      questions: exam.questions.map((i: any) => (i.question_id === qid ? { ...i, score } : i)),
    });
  };

  const removeQuestion = (qid: number) => {
    setExam({ ...exam, questions: (exam.questions || []).filter((i: any) => i.question_id !== qid) });
  };

  const save = async () => {
    try {
      const meta = metaForm.getFieldsValue();
      const e = await api.put(
        `/exams/${examID}`,
        {
          title: meta.title,
          duration_minutes: meta.duration_minutes || null,
          deadline: meta.deadline ? new Date(meta.deadline).toISOString() : null,
          items: (exam.questions || []).map((i: any) => ({ question_id: i.question_id, score: i.score })),
        }
      );
      setExam({ ...e, questions: exam.questions.map((i: any) => ({ ...i, score: i.score })) });
      message.success("已保存");
    } catch (e: any) {
      message.error(e.message);
    }
  };

  const publish = async () => {
    try {
      await api.post(`/exams/${examID}/publish`);
      message.success("已发布");
      load();
    } catch (e: any) { message.error(e.message); }
  };
  const close = async () => {
    try {
      await api.post(`/exams/${examID}/close`);
      message.success("已关闭");
      load();
    } catch (e: any) { message.error(e.message); }
  };
  const del = async () => {
    try {
      await api.del(`/exams/${examID}`);
      message.success("已删除");
      nav(`/teacher/course/${exam.course_id}`);
    } catch (e: any) { message.error(e.message); }
  };

  // ---------- AI 生成 ----------
  const runAiGenerate = async () => {
    const v = await aiForm.validateFields();
    setAiBusy(true);
    try {
      const specs = (v.specs || []).map((s: any) => ({ type: s.type, count: s.count, difficulty: s.difficulty || 3 }));
      const scores: Record<string, number> = {};
      (v.specs || []).forEach((s: any) => { scores[s.type] = s.scores ?? 5; });
      const task = await api.post("/ai/generate", {
        course_id: exam.course_id,
        title: v.title,
        kind: v.kind,
        knowledge_points: v.knowledge_points,
        specs,
        scores,
      });
      // 轮询任务
      for (let i = 0; i < 60; i++) {
        await new Promise((r) => setTimeout(r, 1000));
        const t = await api.get(`/ai/tasks/${task.id}`);
        if (t.status === "success") {
          message.success(`AI 已生成 ${t.result.question_count} 题（${t.result.llm_mode === "real" ? "大模型" : "模拟模式"}）`);
          setAiOpen(false);
          nav(`/teacher/exam/${t.result.exam_id}/edit`);
          return;
        }
        if (t.status === "failed") throw new Error(t.error || "AI 任务失败");
      }
      throw new Error("AI 任务超时，请稍后重试");
    } catch (e: any) {
      message.error(e.message);
    } finally {
      setAiBusy(false);
    }
  };

  if (!exam) return <div>加载中…</div>;
  const total = (exam.questions || []).reduce((s: number, q: any) => s + (q.score || 0), 0);

  return (
    <div>
      <Space style={{ marginBottom: 16, width: "100%", justifyContent: "space-between" }}>
        <Space>
          <Button icon={<ArrowLeftOutlined />} onClick={() => nav(`/teacher/course/${exam.course_id}`)}>返回课程</Button>
          <h2 style={{ margin: 0 }}>{exam.title}</h2>
          <Tag color={STATUS_LABEL[exam.status]?.color}>{STATUS_LABEL[exam.status]?.text}</Tag>
          <Tag>{KIND_LABEL[exam.kind]}</Tag>
          {!isDraft && <Alert message="已发布/已关闭的试卷不可编辑，如需修改请关闭后重新编辑（草稿才可编辑）" type="warning" showIcon style={{ margin: 0 }} />}
        </Space>
        <Space>
          {isDraft && (
            <>
              <Button type="primary" icon={<SaveOutlined />} onClick={save}>保存</Button>
              <Popconfirm title="删除该草稿？" onConfirm={del}>
                <Button danger icon={<DeleteOutlined />}>删除</Button>
              </Popconfirm>
              <Button type="primary" icon={<PlayCircleOutlined />} onClick={publish}>发布</Button>
            </>
          )}
          {exam.status === "published" && (
            <Button icon={<StopOutlined />} onClick={close}>关闭</Button>
          )}
        </Space>
      </Space>

      <Row gutter={16}>
        <Col span={14}>
          <Card
            title={`已选题目（${exam.questions?.length || 0} 题，共 ${total} 分）`}
            extra={
              isDraft ? (
                <Button size="small" icon={<RobotOutlined />} onClick={() => setAiOpen(true)}>AI 补充题目</Button>
              ) : null
            }
          >
            <Table
              rowKey="question_id"
              size="small"
              dataSource={exam.questions || []}
              pagination={false}
              columns={[
                { title: "#", dataIndex: "seq", width: 40 },
                { title: "题型", dataIndex: "type", width: 80, render: (t: string) => QUESTION_TYPES[t] || t },
                { title: "题干", dataIndex: "content", ellipsis: true, render: (c: any) => c?.stem },
                {
                  title: "分值", dataIndex: "score", width: 90,
                  render: (s: number, q: any) =>
                    isDraft ? (
                      <InputNumber size="small" min={0.5} max={100} value={s} onChange={(v) => setScore(q.question_id, v)} style={{ width: 80 }} />
                    ) : s,
                },
                {
                  title: "", width: 50,
                  render: (_: any, q: any) =>
                    isDraft ? (
                      <Button size="small" type="text" danger icon={<DeleteOutlined />} onClick={() => removeQuestion(q.question_id)} />
                    ) : null,
                },
              ]}
            />
          </Card>
        </Col>
        <Col span={10}>
          <Card title="题库（点击加入 / 移出试卷）" style={{ marginBottom: 16 }}>
            <div style={{ maxHeight: 420, overflow: "auto" }}>
              {bank.map((q: any) => (
                <div
                  key={q.id}
                  onClick={() => isDraft && toggleQuestion(q)}
                  style={{
                    padding: "6px 10px",
                    marginBottom: 6,
                    border: `1px solid ${selectedIds.has(q.id) ? "#1677ff" : "#eee"}`,
                    borderRadius: 6,
                    background: selectedIds.has(q.id) ? "#e6f4ff" : "#fff",
                    cursor: isDraft ? "pointer" : "default",
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 8,
                  }}
                >
                  <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    <Tag style={{ margin: 0 }}>{QUESTION_TYPES[q.type] || q.type}</Tag> {q.content?.stem}
                    {q.source === "ai" && <Tag color="purple" style={{ marginLeft: 4 }}>AI</Tag>}
                  </span>
                  <Tag color={selectedIds.has(q.id) ? "blue" : "default"} style={{ flexShrink: 0 }}>
                    {selectedIds.has(q.id) ? "已选" : "加入"}
                  </Tag>
                </div>
              ))}
              {bank.length === 0 && <div style={{ color: "#888", padding: 12 }}>题库为空</div>}
            </div>
          </Card>

          {isDraft && (
            <Card title="试卷信息">
              <Form form={metaForm} layout="vertical" size="small">
                <Form.Item name="title" label="标题" rules={[{ required: true }]}>
                  <Input />
                </Form.Item>
                <Form.Item name="duration_minutes" label="限时（分钟）">
                  <InputNumber min={5} max={600} style={{ width: "100%" }} />
                </Form.Item>
                <Form.Item name="deadline" label="截止时间">
                  <Input type="datetime-local" />
                </Form.Item>
              </Form>
            </Card>
          )}
        </Col>
      </Row>

      <Modal
        title="AI 生成新试卷"
        open={aiOpen}
        onCancel={() => !aiBusy && setAiOpen(false)}
        onOk={runAiGenerate}
        okText={aiBusy ? "生成中…" : "开始生成"}
        confirmLoading={aiBusy}
        width={640}
      >
        <Alert
          style={{ marginBottom: 12 }}
          type="info"
          showIcon
          message="AI 将按以下配置生成一套新试卷（草稿），生成后需人工审核再发布。"
        />
        <Form form={aiForm} layout="vertical" initialValues={{ kind: "exam", specs: [{ type: "single_choice", count: 5, difficulty: 3 }], scores: {} }}>
          <Form.Item name="title" label="试卷标题" rules={[{ required: true }]}>
            <Input placeholder="如：Python 第 2 章 单元测试" />
          </Form.Item>
          <Form.Item name="kind" label="类型" rules={[{ required: true }]}>
            <Select options={[{ label: "期末考试", value: "exam" }, { label: "课后作业", value: "assignment" }]} />
          </Form.Item>
          <Form.Item name="knowledge_points" label="知识点范围（用顿号分隔，可留空）">
            <Input placeholder="如：循环、函数、列表" />
          </Form.Item>
          <Form.Item label="题型与数量配置" required>
            <Form.List name="specs">
              {(fields, { add, remove }) => (
                <>
                  {fields.map((f) => (
                    <Space key={f.key} style={{ display: "flex", marginBottom: 6 }}>
                      <Form.Item name={[f.name, "type"]} noStyle rules={[{ required: true }]}>
                        <Select style={{ width: 120 }} options={Object.entries(QUESTION_TYPES).map(([value, label]) => ({ value, label }))} />
                      </Form.Item>
                      <Form.Item name={[f.name, "count"]} noStyle rules={[{ required: true }]}>
                        <InputNumber min={1} max={20} addonBefore="题数" style={{ width: 110 }} />
                      </Form.Item>
                      <Form.Item name={[f.name, "scores"]} noStyle>
                        <InputNumber min={0.5} max={100} addonBefore="分值" style={{ width: 110 }} />
                      </Form.Item>
                      <Button type="text" danger icon={<DeleteOutlined />} onClick={() => remove(f.name)} />
                    </Space>
                  ))}
                  <Button size="small" type="dashed" onClick={() => add({ type: "single_choice", count: 1, difficulty: 3 })} icon={<PlusOutlined />}>
                    添加题型
                  </Button>
                </>
              )}
            </Form.List>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}