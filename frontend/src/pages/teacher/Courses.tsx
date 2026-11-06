import { useEffect, useState } from "react";
import { Button, Card, Col, Form, Input, InputNumber, Modal, Row, Space, Tag, message } from "antd";
import { PlusOutlined, ArrowRightOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import { api, Course } from "../../api";

export default function Courses() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();
  const nav = useNavigate();

  const load = async () => {
    setLoading(true);
    try {
      setCourses(await api.get("/courses"));
    } catch (e: any) {
      message.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const onCreate = async (v: any) => {
    try {
      await api.post("/courses", v);
      message.success("课程已创建");
      setOpen(false);
      form.resetFields();
      load();
    } catch (e: any) {
      message.error(e.message);
    }
  };

  return (
    <div>
      <Space style={{ width: "100%", justifyContent: "space-between", marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>我的课程</h2>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)}>
          新建课程
        </Button>
      </Space>
      <Row gutter={[16, 16]}>
        {courses.map((c) => (
          <Col key={c.id} xs={24} sm={12} lg={8}>
            <Card
              title={c.name}
              extra={<a onClick={() => nav(`/teacher/course/${c.id}`)}>进入 <ArrowRightOutlined /></a>}
              actions={[]}
            >
              <p style={{ color: "#888", minHeight: 40 }}>{c.description || "（无课程简介）"}</p>
              <Space wrap>
                <Tag color="blue">学生 {c.student_count} 人</Tag>
                <Tag>作业占比 {(c.assignment_weight * 100).toFixed(0)}%</Tag>
                <Tag color="green">考试占比 {((1 - c.assignment_weight) * 100).toFixed(0)}%</Tag>
              </Space>
            </Card>
          </Col>
        ))}
      </Row>
      {!loading && courses.length === 0 && (
        <Card>暂无课程，点击右上角「新建课程」开始。</Card>
      )}

      <Modal title="新建课程" open={open} onOk={() => form.submit()} onCancel={() => setOpen(false)} destroyOnClose>
        <Form form={form} layout="vertical" onFinish={onCreate} initialValues={{ assignment_weight: 0.4 }}>
          <Form.Item name="name" label="课程名称" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="description" label="课程简介">
            <Input.TextArea rows={3} />
          </Form.Item>
          <Form.Item
            name="assignment_weight"
            label="平时作业占总评比重（考试占比 = 1 - 该值）"
            rules={[{ required: true }]}
          >
            <InputNumber min={0} max={1} step={0.1} style={{ width: "100%" }} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}