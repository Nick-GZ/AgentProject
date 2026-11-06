import { useEffect, useState } from "react";
import { Button, Card, Table, Tag, message } from "antd";
import { ArrowLeftOutlined, FileTextOutlined } from "@ant-design/icons";
import { useNavigate, useParams } from "react-router-dom";
import { api, STATUS_LABEL } from "../../api";
import dayjs from "dayjs";

export default function Submissions() {
  const { examId } = useParams();
  const examID = Number(examId);
  const nav = useNavigate();
  const [exam, setExam] = useState<any>(null);
  const [subs, setSubs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [e, s] = await Promise.all([api.get(`/exams/${examID}`), api.get(`/exams/${examID}/submissions`)]);
      setExam(e);
      setSubs(s);
    } catch (e: any) {
      message.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [examID]);

  return (
    <div>
      <Card
        title={`答卷列表 — ${exam?.title || ""}（${exam?.kind === "exam" ? "考试" : "作业"}）`}
        extra={
          <Button icon={<ArrowLeftOutlined />} onClick={() => nav(`/teacher/course/${exam?.course_id}`)}>
            返回课程
          </Button>
        }
      >
        <Table
          rowKey="id"
          loading={loading}
          dataSource={subs}
          pagination={false}
          columns={[
            { title: "学生", dataIndex: "student_name", width: 120 },
            {
              title: "状态",
              dataIndex: "status",
              width: 110,
              render: (s: string) => <Tag color={STATUS_LABEL[s]?.color}>{STATUS_LABEL[s]?.text || s}</Tag>,
            },
            {
              title: "待批阅题数",
              dataIndex: "pending_gradings",
              width: 110,
              render: (n: number) => (n > 0 ? <Tag color="orange">{n}</Tag> : <Tag color="success">已完成</Tag>),
            },
            { title: "总分", dataIndex: "total_score", width: 90 },
            {
              title: "交卷时间",
              dataIndex: "submitted_at",
              render: (v) => (v ? dayjs(v).format("YYYY-MM-DD HH:mm") : "—"),
            },
            {
              title: "操作",
              width: 130,
              render: (_: any, s: any) => (
                <Button type="link" icon={<FileTextOutlined />} onClick={() => nav(`/teacher/submission/${s.id}`)}>
                  查看 / 批阅
                </Button>
              ),
            },
          ]}
        />
      </Card>
    </div>
  );
}