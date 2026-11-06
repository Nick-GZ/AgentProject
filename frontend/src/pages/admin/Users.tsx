import { useEffect, useState } from "react";
import { Button, Form, Input, Modal, Select, Space, Table, Tag, message } from "antd";
import { PlusOutlined } from "@ant-design/icons";
import { api, User } from "../../api";

const ROLE_TAG: Record<string, { text: string; color: string }> = {
  admin: { text: "管理员", color: "red" },
  teacher: { text: "教师", color: "blue" },
  student: { text: "学生", color: "green" },
};

export default function Users() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();

  const load = async () => {
    setLoading(true);
    try {
      setUsers(await api.get("/users"));
    } catch (e: any) {
      message.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const onCreate = async (values: any) => {
    try {
      await api.post("/users", values);
      message.success("用户已创建");
      setOpen(false);
      form.resetFields();
      load();
    } catch (e: any) {
      message.error(e.message);
    }
  };

  return (
    <div>
      <Space style={{ marginBottom: 16, justifyContent: "space-between", width: "100%" }}>
        <h2 style={{ margin: 0 }}>用户管理</h2>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)}>
          新增用户
        </Button>
      </Space>
      <Table
        rowKey="id"
        loading={loading}
        dataSource={users}
        pagination={false}
        columns={[
          { title: "ID", dataIndex: "id", width: 70 },
          { title: "用户名", dataIndex: "username" },
          { title: "姓名", dataIndex: "name" },
          {
            title: "角色",
            dataIndex: "role",
            render: (r: string) => <Tag color={ROLE_TAG[r]?.color}>{ROLE_TAG[r]?.text || r}</Tag>,
          },
        ]}
      />
      <Modal title="新增用户" open={open} onOk={() => form.submit()} onCancel={() => setOpen(false)} destroyOnClose>
        <Form form={form} layout="vertical" onFinish={onCreate} initialValues={{ role: "student" }}>
          <Form.Item name="username" label="用户名" rules={[{ required: true, min: 3 }]}>
            <Input />
          </Form.Item>
          <Form.Item name="password" label="初始密码" rules={[{ required: true, min: 6 }]}>
            <Input.Password />
          </Form.Item>
          <Form.Item name="name" label="姓名" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="role" label="角色" rules={[{ required: true }]}>
            <Select
              options={[
                { label: "学生", value: "student" },
                { label: "教师", value: "teacher" },
                { label: "管理员", value: "admin" },
              ]}
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}