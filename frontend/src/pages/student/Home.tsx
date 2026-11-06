import { useEffect, useState } from "react";
import { Button, Card, Col, Empty, Row, Table, Tabs, Tag, message } from "antd";
import { FileTextOutlined, ReadOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import { api, Course, Exam, KIND_LABEL, STATUS_LABEL } from "../../api";

export default function StudentHome() {
  const nav = useNavigate();
  const [courses, setCourses] = useState<Course[]>([]);
  const [exams, setExams] = useState<any[]>([]);
  const [grades, setGrades] = useState<any[]>([]);
  const [subMap, setSubMap] = useState<Record<number, number>>({}); // exam_id -> submission_id

  const load = async () => {
    try {
      const cs = await api.get("/courses");
      setCourses(cs);
      const all: any[] = [];
      for (const c of cs) {
        const es = await api.get(`/courses/${c.id}/exams`);
        es.forEach((e: Exam) => all.push({ ...e, course_name: c.name }));
      }
      setExams(all);
      const subs = await api.get("/submissions/mine");
      const m: Record<number, number> = {};
      subs.forEach((s: any) => (m[s.exam_id] = s.id));
      setSubMap(m);
    } catch (e: any) {
      message.error(e.message);
    }
  };

  const loadGrades = async () => {
    try {
      setGrades(await api.get("/grades/mine"));
    } catch (e: any) {
      message.error(e.message);
    }
  };

  useEffect(() => {
    load();
    loadGrades();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const examColumns = [
    { title: "课程", dataIndex: "course_name", width: 160 },
    { title: "标题", dataIndex: "title" },
    { title: "类型", dataIndex: "kind", width: 80, render: (k: string) => KIND_LABEL[k] },
    { title: "状态", dataIndex: "status", width: 90, render: (s: string) => <Tag color={STATUS_LABEL[s]?.color}>{STATUS_LABEL[s]?.text}</Tag> },
    {
      title: "我的进度",
      width: 130,
      render: (_: any, e: any) => {
        if (e.status === "closed") return e.my_submission_status ? <Tag>已截止</Tag> : <Tag color="default">未作答</Tag>;
        if (!e.my_submission_status) return <Tag color="processing">未开始</Tag>;
        if (e.my_submission_status === "in_progress") return <Tag color="processing">作答中</Tag>;
        if (e.my_submission_status === "submitted") return <Tag color="warning">待批阅</Tag>;
        return <Tag color="success">已批阅 {e.my_total_score} 分</Tag>;
      },
    },
    {
      title: "操作",
      width: 120,
      render: (_: any, e: any) => {
        if (e.status === "published" && (!e.my_submission_status || e.my_submission_status === "in_progress"))
          return (
            <Button type="primary" size="small" icon={<FileTextOutlined />} onClick={() => nav(`/student/take/${e.id}`)}>
              开始作答
            </Button>
          );
        if (subMap[e.id])
          return (
            <Button size="small" icon={<FileTextOutlined />} onClick={() => nav(`/student/submission/${subMap[e.id]}`)}>
              查看结果
            </Button>
          );
        return <span style={{ color: "#bbb" }}>—</span>;
      },
    },
  ];

  return (
    <div>
      <Tabs
        items={[
          {
            key: "exams",
            label: "考试 / 作业",
            children: (
              <Table rowKey="id" dataSource={exams} pagination={false} columns={examColumns} />
            ),
          },
          {
            key: "courses",
            label: `我的课程（${courses.length}）`,
            children:
              courses.length === 0 ? (
                <Empty description="你还没有加入任何课程，请等待老师将你加入课程" />
              ) : (
                <Row gutter={[16, 16]}>
                  {courses.map((c) => (
                    <Col key={c.id} xs={24} sm={12} lg={8}>
                      <Card title={c.name} extra={<ReadOutlined />}>
                        <p style={{ color: "#888", minHeight: 40 }}>{c.description}</p>
                        <Tag color="blue">作业占 {(c.assignment_weight * 100).toFixed(0)}%</Tag>
                        <Tag color="green">考试占 {((1 - c.assignment_weight) * 100).toFixed(0)}%</Tag>
                      </Card>
                    </Col>
                  ))}
                </Row>
              ),
          },
          {
            key: "grades",
            label: "我的成绩",
            children:
              grades.length === 0 ? (
                <Empty description="暂无成绩" />
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  {grades.map((g: any) => (
                    <Card key={g.course_id} title={g.course_name} size="small">
                      <Table
                        rowKey="exam_id"
                        size="small"
                        pagination={false}
                        dataSource={g.items}
                        columns={[
                          { title: "项目", dataIndex: "title" },
                          { title: "类型", dataIndex: "kind", width: 80, render: (k: string) => KIND_LABEL[k] },
                          {
                            title: "得分",
                            width: 140,
                            render: (_: any, i: any) =>
                              i.score == null ? <Tag>未提交</Tag> : `${i.score} / ${i.full_score}`,
                          },
                        ]}
                      />
                      <div style={{ marginTop: 12 }}>
                        <b>课程总评：</b>
                        {g.final_score == null ? (
                          <Tag>暂无（需完成至少一项）</Tag>
                        ) : (
                          <Tag color="green">{g.final_score} / 100</Tag>
                        )}
                      </div>
                    </Card>
                  ))}
                </div>
              ),
          },
        ]}
      />
    </div>
  );
}