import { Layout as AntLayout, Menu, Button, Tag, Dropdown } from "antd";
import {
  DashboardOutlined,
  TeamOutlined,
  AuditOutlined,
  ReadOutlined,
  LogoutOutlined,
  UserOutlined,
} from "@ant-design/icons";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "./auth";

const ROLE_TAG: Record<string, { text: string; color: string }> = {
  admin: { text: "管理员", color: "red" },
  teacher: { text: "教师", color: "blue" },
  student: { text: "学生", color: "green" },
};

export default function Layout() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();

  const menuItems: any[] = [];
  if (user?.role === "admin") {
    menuItems.push(
      { key: "/admin", icon: <TeamOutlined />, label: "用户管理" },
      { key: "/audit", icon: <AuditOutlined />, label: "审计日志" },
      { key: "/teacher", icon: <ReadOutlined />, label: "课程管理" }
    );
  } else if (user?.role === "teacher") {
    menuItems.push({ key: "/teacher", icon: <ReadOutlined />, label: "我的课程" });
  } else {
    menuItems.push({ key: "/student", icon: <DashboardOutlined />, label: "学习中心" });
  }

  const selectedKey = menuItems.find((m) => loc.pathname.startsWith(m.key))?.key ?? "/";

  return (
    <AntLayout style={{ minHeight: "100vh" }}>
      <AntLayout.Sider breakpoint="lg" collapsible>
        <div style={{ color: "#fff", textAlign: "center", padding: "18px 8px", fontSize: 16, fontWeight: 600 }}>
          AI 课程管理系统
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[selectedKey]}
          items={menuItems}
          onClick={(e) => nav(e.key)}
        />
      </AntLayout.Sider>
      <AntLayout>
        <AntLayout.Header
          style={{
            background: "#fff",
            padding: "0 24px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            borderBottom: "1px solid #f0f0f0",
          }}
        >
          <div />
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {user && (
              <>
                <UserOutlined />
                <span>{user.name}</span>
                <Tag color={ROLE_TAG[user.role]?.color}>{ROLE_TAG[user.role]?.text}</Tag>
              </>
            )}
            <Button
              type="text"
              icon={<LogoutOutlined />}
              onClick={() => {
                logout();
                nav("/login");
              }}
            >
              退出
            </Button>
          </div>
        </AntLayout.Header>
        <AntLayout.Content style={{ padding: 24 }}>
          <Outlet />
        </AntLayout.Content>
      </AntLayout>
    </AntLayout>
  );
}