import { useEffect, useState } from "react";
import { Table, Tag, message } from "antd";
import dayjs from "dayjs";
import { api } from "../../api";

const ACTION_COLOR: Record<string, string> = {
  login: "blue",
  register: "green",
  publish_exam: "purple",
  close_exam: "purple",
  submit: "cyan",
  regrade: "orange",
  finalize: "volcano",
  create_user: "magenta",
};

export default function Audit() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        setLogs(await api.get("/audit-logs?limit=200"));
      } catch (e: any) {
        message.error(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div>
      <h2>审计日志</h2>
      <Table
        rowKey="id"
        loading={loading}
        dataSource={logs}
        pagination={{ pageSize: 20 }}
        columns={[
          { title: "时间", dataIndex: "created_at", width: 180, render: (v) => dayjs(v).format("YYYY-MM-DD HH:mm:ss") },
          { title: "用户", dataIndex: "user_name", width: 120 },
          {
            title: "操作",
            dataIndex: "action",
            width: 140,
            render: (a) => <Tag color={ACTION_COLOR[a] || "default"}>{a}</Tag>,
          },
          { title: "对象", dataIndex: "target", width: 160 },
          { title: "详情", dataIndex: "detail" },
        ]}
      />
    </div>
  );
}