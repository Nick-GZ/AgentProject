import { useState } from "react";
import { Button, Card, Form, Input, Tabs, message, Typography } from "antd";
import { LockOutlined, UserOutlined, IdcardOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth";

export default function Login() {
  const { login, register } = useAuth();
  const nav = useNavigate();
  const [loading, setLoading] = useState(false);

  const onLogin = async (values: any) => {
    setLoading(true);
    try {
      const u = await login(values.username, values.password);
      message.success(`欢迎，${u.name}`);
      nav(u.role === "admin" ? "/admin" : u.role === "teacher" ? "/teacher" : "/student");
    } catch (e: any) {
      message.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  const onRegister = async (values: any) => {
    setLoading(true);
    try {
      await register(values.username, values.password, values.name);
      message.success("注册成功，请登录");
    } catch (e: any) {
      message.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f0f2f5" }}>
      <Card style={{ width: 400, boxShadow: "0 2px 12px rgba(0,0,0,.08)" }}>
        <Typography.Title level={3} style={{ textAlign: "center", marginBottom: 4 }}>
          AI 课程管理系统
        </Typography.Title>
        <Typography.Paragraph type="secondary" style={{ textAlign: "center", marginBottom: 24 }}>
          大模型驱动的出题、批阅与成绩管理
        </Typography.Paragraph>
        <Tabs
          centered
          items={[
            {
              key: "login",
              label: "登录",
              children: (
                <Form onFinish={onLogin} size="large">
                  <Form.Item name="username" rules={[{ required: true, message: "请输入用户名" }]}>
                    <Input prefix={<UserOutlined />} placeholder="用户名" />
                  </Form.Item>
                  <Form.Item name="password" rules={[{ required: true, message: "请输入密码" }]}>
                    <Input.Password prefix={<LockOutlined />} placeholder="密码" />
                  </Form.Item>
                  <Button type="primary" htmlType="submit" block loading={loading}>
                    登录
                  </Button>
                </Form>
              ),
            },
            {
              key: "register",
              label: "学生注册",
              children: (
                <Form onFinish={onRegister} size="large">
                  <Form.Item name="name" rules={[{ required: true, message: "请输入姓名" }]}>
                    <Input prefix={<IdcardOutlined />} placeholder="姓名" />
                  </Form.Item>
                  <Form.Item name="username" rules={[{ required: true, min: 3, message: "用户名至少 3 位" }]}>
                    <Input prefix={<UserOutlined />} placeholder="用户名" />
                  </Form.Item>
                  <Form.Item name="password" rules={[{ required: true, min: 6, message: "密码至少 6 位" }]}>
                    <Input.Password prefix={<LockOutlined />} placeholder="密码" />
                  </Form.Item>
                  <Button type="primary" htmlType="submit" block loading={loading}>
                    注册学生账号
                  </Button>
                </Form>
              ),
            },
          ]}
        />
      </Card>
    </div>
  );
}