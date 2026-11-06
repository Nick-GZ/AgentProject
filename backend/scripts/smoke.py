"""端到端冒烟测试：覆盖认证、课程、题库、试卷、作答、批阅、成绩、AI 出题全流程。

运行（backend 目录下）：.venv\\Scripts\\python.exe scripts\\smoke.py
"""
import os
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

_BASE = Path(__file__).resolve().parents[1]
os.environ.setdefault("DATABASE_URL", f"sqlite:///{_BASE / 'smoke_test.db'}")

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402
from app.seed import seed  # noqa: E402

seed()

client = TestClient(app)
passed = []


def check(name: str, cond: bool, extra: str = ""):
    passed.append(cond)
    mark = "✅" if cond else "❌"
    print(f"{mark} {name}" + (f"  -- {extra}" if (extra and not cond) else ""))
    if not cond:
        raise SystemExit(f"[FAIL] {name}")


# 1. 登录（教师）
r = client.post("/api/auth/login", json={"username": "teacher1", "password": "123456"})
check("教师登录", r.status_code == 200, r.text)
teacher_token = r.json()["access_token"]
th = {"Authorization": f"Bearer {teacher_token}"}

# 2. 登录（学生）
r = client.post("/api/auth/login", json={"username": "stu1", "password": "123456"})
check("学生登录", r.status_code == 200)
student_token = r.json()["access_token"]
sh = {"Authorization": f"Bearer {student_token}"}

# 3. 错误密码被拒
r = client.post("/api/auth/login", json={"username": "teacher1", "password": "wrong"})
check("错误密码拒绝", r.status_code == 401)

# 4. 学生查看课程
r = client.get("/api/courses", headers=sh)
check("学生课程列表", r.status_code == 200 and len(r.json()) == 1)
course_id = r.json()[0]["id"]

# 5. 学生不能访问题库（越权）
r = client.get(f"/api/courses/{course_id}/questions", headers=sh)
check("学生越权访问题库被拒", r.status_code == 403)

# 6. 教师取题库
r = client.get(f"/api/courses/{course_id}/questions", headers=th)
check("教师题库列表", r.status_code == 200 and len(r.json()) >= 8)

# 7. 教师发布一张新试卷（单选 + 填空 + 简答）
qs = r.json()
r = client.post(
    f"/api/courses/{course_id}/exams",
    json={"title": "冒烟测试小测", "kind": "assignment"},
    headers=th,
)
exam_id = r.json()["id"]
single_q, fill_q, short_q = qs[0], qs[4], qs[6]
r = client.put(
    f"/api/exams/{exam_id}",
    json={
        "items": [
            {"question_id": single_q["id"], "score": 5},
            {"question_id": fill_q["id"], "score": 5},
            {"question_id": short_q["id"], "score": 10},
        ]
    },
    headers=th,
)
check("编辑试卷题目", r.status_code == 200 and r.json()["total_score"] == 20.0)
r = client.post(f"/api/exams/{exam_id}/publish", headers=th)
check("发布试卷", r.status_code == 200 and r.json()["status"] == "published")

# 8. 学生取卷
r = client.get(f"/api/exams/{exam_id}/paper", headers=sh)
check("学生取卷", r.status_code == 200)
paper = r.json()
check("试卷不含答案", all("answer" not in q["content"] for q in paper["questions"]))

# 9. 学生作答并交卷
qids = {q["type"]: q["question_id"] for q in paper["questions"]}
answers = {}
for q in paper["questions"]:
    if q["type"] == "single_choice":
        answers[str(q["question_id"])] = 2
    elif q["type"] == "multi_choice":
        answers[str(q["question_id"])] = [0, 1, 3]
    elif q["type"] == "true_false":
        answers[str(q["question_id"])] = True
    elif q["type"] == "fill_blank":
        answers[str(q["question_id"])] = "len"
    else:
        answers[str(q["question_id"])] = "这是一个简答题的测试答案。"
r = client.post(f"/api/exams/{exam_id}/submit", json={"answers": answers}, headers=sh)
check("学生交卷", r.status_code == 200, r.text)
submission_id = r.json()["submission_id"]

# 10. 重复交卷被拒
r = client.post(f"/api/exams/{exam_id}/submit", json={"answers": answers}, headers=sh)
check("重复交卷被拒", r.status_code == 400)

# 11. 教师查看答卷列表
r = client.get(f"/api/exams/{exam_id}/submissions", headers=th)
check("教师答卷列表", r.status_code == 200 and len(r.json()) == 1)

# 12. AI 批阅主观题
r = client.post(f"/api/submissions/{submission_id}/grade-ai", headers=th)
check("发起 AI 批阅", r.status_code == 200, r.text)
task_id = r.json()["task_id"]
st = time.time()
while time.time() - st < 15:
    tr = client.get(f"/api/ai/tasks/{task_id}", headers=th)
    if tr.json()["status"] in ("success", "failed"):
        break
    time.sleep(0.3)
check("AI 批阅任务完成", tr.json()["status"] == "success", str(tr.json()))

# 13. 教师复核一道题
r = client.get(f"/api/submissions/{submission_id}", headers=th)
gid = next(i["grading"]["id"] for i in r.json()["items"] if i["grading"])
r = client.put(f"/api/gradings/{gid}", json={"score": 8, "feedback": "教师复核"}, headers=th)
check("教师复核判分", r.status_code == 200)

# 14. 成绩
r = client.get("/api/grades/mine", headers=sh)
check("学生查成绩", r.status_code == 200 and len(r.json()) >= 1)
r = client.get(f"/api/courses/{course_id}/grades", headers=th)
check("教师查班级成绩", r.status_code == 200 and len(r.json()["rows"]) >= 3)

# 15. AI 出题
r = client.post(
    "/api/ai/generate",
    json={
        "course_id": course_id,
        "title": "AI 生成的单元测试",
        "kind": "assignment",
        "knowledge_points": "循环、函数",
        "specs": [{"type": "single_choice", "count": 2, "difficulty": 3}, {"type": "short_answer", "count": 1, "difficulty": 4}],
        "scores": {"single_choice": 5, "short_answer": 20},
    },
    headers=th,
)
check("发起 AI 出题", r.status_code == 200, r.text)
task_id = r.json()["id"]
st = time.time()
while time.time() - st < 20:
    tr = client.get(f"/api/ai/tasks/{task_id}", headers=th)
    if tr.json()["status"] in ("success", "failed"):
        break
    time.sleep(0.3)
check("AI 出题任务完成", tr.json()["status"] == "success", str(tr.json()))
gen_exam_id = tr.json()["result"]["exam_id"]
r = client.get(f"/api/exams/{gen_exam_id}", headers=th)
check("AI 生成的试卷含 3 题", r.status_code == 200 and r.json()["question_count"] == 3)

# 16. 未登录访问被拒
r = client.get("/api/courses")
check("未登录拒访", r.status_code == 401)

print(f"\n全部通过：{sum(passed)}/{len(passed)}")