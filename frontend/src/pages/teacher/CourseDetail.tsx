import { useCallback, useEffect, useState } from "react";
import {
  Button, Card, Col, Empty, Form, Input, InputNumber, message, Modal, Popconfirm,
  Row, Select, Space, Table, Tabs, Tag,
} from "antd";
import { DeleteOutlined, EditOutlined, EyeOutlined, PlusOutlined, PlayCircleOutlined, StopOutlined } from "@ant-design/icons";
import { useNavigate, useParams } from "react-router-dom";
import { api, Course, Exam, Question, QUESTION_TYPES, DIFFICULTY, STATUS_LABEL, KIND_LABEL } from "../../api";
import QuestionForm from "../../components/QuestionForm";

export default function CourseDetail() {
  const { id } = useParams();
  const courseId = Number(id);
  const nav = useNavigate();
  const [course, setCourse] = useState<Course | null>(null);
  const [students, setStudents] = useState<any[]>([]);
  const [allStudents, setAllStudents] = useState<any[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [exams, setExams] = useState<Exam[]>([]);
  const [grades, setGrades] = useState<any>(null);
  const [qfOpen, setQfOpen] = useState(false);
  const [qfInitial, setQfInitial] = useState<Question | null>(null);
  const [examModal, setExamModal] = useState(false);
  const [examForm] = Form.useForm();

  const load = useCallback(async () => {
    try {
      const [c, s, q, e] = await Promise.all([
        api.get(`/courses/${courseId}`),
        api.get(`/courses/${courseId}/students`),
        api.get(`/courses/${courseId}/questions`),
        api.get(`/courses/${courseId}/exams`),
      ]);
      setCourse(c);
      setStudents(s);
      setQuestions(q);
      setExams(e);
    } catch (e: any) {
      message.error(e.message);
    }
  }, [courseId]);

  useEffect(() => {
    load();
    api.get("/students").then(setAllStudents).catch(() => {});
  }, [load]);

  const loadGrades = async () => {
    try {
      setGrades(await api.get(`/courses/${courseId}/grades`));
    } catch (e: any) {
      message.error(e.message);
    }
  };

  const onCreateExam = async (v: any) => {
    try {
      const e = await api.post(`/courses/${courseId}/exams`, {
        title: v.title,
        kind: v.kind,
        duration_minutes: v.duration_minutes || null,
        deadline: v.deadline ? new Date(v.deadline).toISOString() : null,
      });
      message.success("已创建，请继续编辑题目");
      setExamModal(false);
      examForm.resetFields();
      nav(`/teacher/exam/${e.id}/edit`);
    } catch (e: any) {
      message.error(e.message);
    }
  };

  const onPublish = async (exam: Exam) => {
    try {
      await api.post(`/exams/${exam.id}/publish`);
      message.success("已发布");
      load();
    } catch (e: any) { message.error(e.message); }
  };
  const onClose = async (exam: Exam) => {
    try {
      await api.post(`/exams/${exam.id}/close`);
      message.success("已关闭");
      load();
    } catch (e: any) { message.error(e.message); }
  };
  const onDelete = async (exam: Exam) => {
    try {
      await api.del(`/exams/${exam.id}`);
      message.success("已删除");
      load();
    } catch (e: any) { message.error(e.message); }
  };

  const addStudent = async (sid: number) => {
    try {
      await api.post(`/courses/${courseId}/students`, { student_id: sid });
      message.success("已添加");
      load();
    } catch (e: any) { message.error(e.message); }
  };
  const removeStudent = async (sid: number) => {
    try {
      await api.del(`/courses/${courseId}/students/${sid}`);
      message.success("已移除");
      load();
    } catch (e: any) { message.error(e.message); }
  };

  const deleteQuestion = async (qid: number) => {
    try {
      await api.del(`/questions/${qid}`);
      message.success("已删除");
      load();
    } catch (e: any) { message.error(e.message); }
  };

  const examColumns = [
    { title: "ID", dataIndex: "id", width: 60 },
    {
      title: "标题", dataIndex: "title",
      render: (t: string, e: Exam) => <a onClick={() => nav(`/teacher/exam/${e.id}/edit`)}>{t}</a>,
    },
    { title: "类型", dataIndex: "kind", width: 80, render: (k: string) => KIND_LABEL[k] },
    {
      title: "状态", dataIndex: "status", width: 100,
      render: (s: string) => <Tag color={STATUS_LABEL[s]?.color}>{STATUS_LABEL[s]?.text || s}</Tag>,
    },
    { title: "题数", dataIndex: "question_count", width: 70 },
    { title: "总分", dataIndex: "total_score", width: 80 },
    {
      title: "操作", width: 300,
      render: (_: any, e: Exam) => (
        <Space size="small">
          {e.status === "draft" && (
            <>
              <Button size="small" type="primary" icon={<PlayCircleOutlined />} onClick={() => onPublish(e)}>发布</Button>
              <Popconfirm title="删除该草稿试卷？" onConfirm={() => onDelete(e)}>
                <Button size="small" danger icon={<DeleteOutlined />}>删除</Button>
              </Popconfirm>
            </>
          )}
          {e.status === "published" && (
            <Button size="small" icon={<StopOutlined />} onClick={() => onClose(e)}>关闭</Button>
          )}
          <Button size="small" icon={<EyeOutlined />} onClick={() => nav(`/teacher/exam/${e.id}/submissions`)}>答卷</Button>
        </Space>
      ),
    },
  ];

  return (
    <div>
      {course && (
        <>
          <h2>{course.name} <span style={{ fontSize: 14, color: "#888" }}>（作业占 {(course.assignment_weight * 100).toFixed(0)}%）</span></h2>
          <p style={{ color: "#888" }}>{course.description}</p>
        </>
      )}
      <Tabs
        items={[
          {
            key: "exams",
            label: "考试 / 作业",
            children: (
              <>
                <Button type="primary" icon={<PlusOutlined />} style={{ marginBottom: 12 }} onClick={() => setExamModal(true)}>
                  新建试卷 / 作业
                </Button>
                <Table rowKey="id" dataSource={exams} pagination={false} columns={examColumns} />
              </>
            ),
          },
          {
            key: "questions",
            label: "题库",
            children: (
              <>
                <Button type="primary" icon={<PlusOutlined />} style={{ marginBottom: 12 }} onClick={() => { setQfInitial(null); setQfOpen(true); }}>
                  新增题目
                </Button>
                <Table
                  rowKey="id"
                  dataSource={questions}
                  pagination={{ pageSize: 10 }}
                  columns={[
                    { title: "ID", dataIndex: "id", width: 60 },
                    { title: "题型", dataIndex: "type", width: 90, render: (t: string) => QUESTION_TYPES[t] || t },
                    { title: "难度", dataIndex: "difficulty", width: 70, render: (d: number) => DIFFICULTY[d] },
                    { title: "知识点", dataIndex: "knowledge_point", width: 140 },
                    { title: "题干", dataIndex: "content", ellipsis: true, render: (c: any) => c?.stem },
                    { title: "来源", dataIndex: "source", width: 80, render: (s: string) => (s === "ai" ? <Tag color="purple">AI</Tag> : <Tag>手动</Tag>) },
                    {
                      title: "操作", width: 150,
                      render: (_: any, q: Question) => (
                        <Space size="small">
                          <Button size="small" icon={<EditOutlined />} onClick={() => { setQfInitial(q); setQfOpen(true); }}>编辑</Button>
                          <Popconfirm title="删除该题？（已被试卷引用的题无法删除）" onConfirm={() => deleteQuestion(q.id)}>
                            <Button size="small" danger icon={<DeleteOutlined />}>删除</Button>
                          </Popconfirm>
                        </Space>
                      ),
                    },
                  ]}
                />
              </>
            ),
          },
          {
            key: "students",
            label: `学生（${students.length}）`,
            children: (
              <>
                <Space style={{ marginBottom: 12 }}>
                  <Select
                    placeholder="选择学生加入课程"
                    style={{ width: 260 }}
                    options={allStudents
                      .filter((s) => !students.some((x) => x.id === s.id))
                      .map((s) => ({ label: `${s.name}（${s.username}）`, value: s.id }))}
                    onChange={(v) => addStudent(v)}
                  />
                </Space>
                <Table
                  rowKey="id"
                  dataSource={students}
                  pagination={false}
                  columns={[
                    { title: "ID", dataIndex: "id", width: 70 },
                    { title: "用户名", dataIndex: "username" },
                    { title: "姓名", dataIndex: "name" },
                    {
                      title: "操作", width: 100,
                      render: (_: any, s: any) => (
                        <Popconfirm title="移出该课程？" onConfirm={() => removeStudent(s.id)}>
                          <Button size="small" danger>移除</Button>
                        </Popconfirm>
                      ),
                    },
                  ]}
                />
              </>
            ),
          },
          {
            key: "grades",
            label: "成绩",
            children: (
              <>
                <Button type="primary" style={{ marginBottom: 12 }} onClick={loadGrades}>刷新成绩</Button>
                {grades ? (
                  <Table
                    rowKey="student_id"
                    pagination={false}
                    dataSource={grades.rows}
                    columns={[
                      { title: "学生", dataIndex: "student_name", fixed: "left", width: 120 },
                      ...grades.exams.map((e: any) => ({
                        title: `${e.title}（${KIND_LABEL[e.kind]}）`,
                        width: 150,
                        render: (_: any, row: any) => {
                          const item = row.items.find((i: any) => i.exam_id === e.id);
                          return item?.percentage != null ? `${item.score}/${item.full_score}` : "—";
                        },
                      })),
                      {
                        title: "总评", dataIndex: "final_score", width: 90, fixed: "right",
                        render: (v: number | null) => (v == null ? <Tag>未交</Tag> : <Tag color="green">{v}</Tag>),
                      },
                    ]}
                  />
                ) : (
                  <Empty description="点击「刷新成绩」加载" />
                )}
              </>
            ),
          },
        ]}
      />

      <QuestionForm
        courseId={courseId}
        open={qfOpen}
        initial={qfInitial}
        onDone={() => { setQfOpen(false); load(); }}
        onCancel={() => setQfOpen(false)}
      />

      <Modal title="新建试卷 / 作业" open={examModal} onOk={() => examForm.submit()} onCancel={() => setExamModal(false)} destroyOnClose>
        <Form form={examForm} layout="vertical" onFinish={onCreateExam} initialValues={{ kind: "exam" }}>
          <Form.Item name="title" label="标题" rules={[{ required: true }]}>
            <Input placeholder="如：Python 程序设计 期末考试" />
          </Form.Item>
          <Form.Item name="kind" label="类型" rules={[{ required: true }]}>
            <Select options={[{ label: "期末考试", value: "exam" }, { label: "课后作业", value: "assignment" }]} />
          </Form.Item>
          <Form.Item name="duration_minutes" label="考试限时（分钟，仅考试建议填写）">
            <InputNumber min={5} max={600} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="deadline" label="截止时间（作业建议填写）">
            <Input type="datetime-local" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}