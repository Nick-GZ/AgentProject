import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { Spin } from "antd";
import { useAuth } from "./auth";
import Layout from "./Layout";
import Login from "./pages/Login";
import Users from "./pages/admin/Users";
import Audit from "./pages/admin/Audit";
import Courses from "./pages/teacher/Courses";
import CourseDetail from "./pages/teacher/CourseDetail";
import ExamEditor from "./pages/teacher/ExamEditor";
import Submissions from "./pages/teacher/Submissions";
import GradeSubmission from "./pages/teacher/GradeSubmission";
import StudentHome from "./pages/student/Home";
import TakeExam from "./pages/student/TakeExam";
import ViewSubmission from "./pages/student/ViewSubmission";

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const loc = useLocation();
  if (!user) return <Navigate to="/login" state={{ from: loc.pathname }} replace />;
  return <>{children}</>;
}

function RequireRole({ roles, children }: { roles: string[]; children: React.ReactNode }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (!roles.includes(user.role)) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function HomeRedirect() {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (user.role === "admin") return <Navigate to="/admin" replace />;
  if (user.role === "teacher") return <Navigate to="/teacher" replace />;
  return <Navigate to="/student" replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<RequireAuth><Layout /></RequireAuth>}>
        <Route path="/" element={<HomeRedirect />} />

        <Route path="/admin" element={<RequireRole roles={["admin"]}><Users /></RequireRole>} />
        <Route path="/audit" element={<RequireRole roles={["admin"]}><Audit /></RequireRole>} />

        <Route path="/teacher" element={<RequireRole roles={["teacher", "admin"]}><Courses /></RequireRole>} />
        <Route path="/teacher/course/:id" element={<RequireRole roles={["teacher", "admin"]}><CourseDetail /></RequireRole>} />
        <Route path="/teacher/exam/:examId/edit" element={<RequireRole roles={["teacher", "admin"]}><ExamEditor /></RequireRole>} />
        <Route path="/teacher/exam/:examId/submissions" element={<RequireRole roles={["teacher", "admin"]}><Submissions /></RequireRole>} />
        <Route path="/teacher/submission/:subId" element={<RequireRole roles={["teacher", "admin"]}><GradeSubmission /></RequireRole>} />

        <Route path="/student" element={<RequireRole roles={["student"]}><StudentHome /></RequireRole>} />
        <Route path="/student/take/:examId" element={<RequireRole roles={["student"]}><TakeExam /></RequireRole>} />
        <Route path="/student/submission/:subId" element={<RequireRole roles={["student"]}><ViewSubmission /></RequireRole>} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}