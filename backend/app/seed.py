"""生成演示数据：默认账号 + 示例课程/题库/试卷/作业 + 一份已批阅答卷。

运行：python -m app.seed   （在 backend 目录下）
"""
import sys

from sqlalchemy import select, func
from sqlalchemy.orm import Session

from .auth import hash_password
from .database import Base, SessionLocal, engine
from .models import Course, Enrollment, Exam, ExamQuestion, Question, Submission, User
from .services import process_submission

DEFAULT_USERS = [
    # (username, password, name, role)
    ("admin", "admin123", "系统管理员", "admin"),
    ("teacher1", "123456", "王老师", "teacher"),
    ("stu1", "123456", "李同学", "student"),
    ("stu2", "123456", "张同学", "student"),
    ("stu3", "123456", "赵同学", "student"),
]


def _sample_questions(course_id: int) -> list[dict]:
    return [
        {
            "type": "single_choice",
            "difficulty": 2,
            "knowledge_point": "Python 基础",
            "content": {
                "stem": "下列哪个是 Python 中不可变的序列类型？",
                "options": ["列表 list", "字典 dict", "元组 tuple", "集合 set"],
                "answer": 2,
            },
        },
        {
            "type": "single_choice",
            "difficulty": 3,
            "knowledge_point": "面向对象",
            "content": {
                "stem": "Python 中定义类的方法时，第一个参数约定写作什么？",
                "options": ["this", "self", "that", "me"],
                "answer": 1,
            },
        },
        {
            "type": "multi_choice",
            "difficulty": 3,
            "knowledge_point": "Python 基础",
            "content": {
                "stem": "下列哪些属于 Python 的内置数据结构？（多选）",
                "options": ["列表", "元组", "栈", "字典"],
                "answer": [0, 1, 3],
            },
        },
        {
            "type": "true_false",
            "difficulty": 1,
            "knowledge_point": "Python 基础",
            "content": {
                "stem": "Python 是一种解释型语言。",
                "answer": True,
            },
        },
        {
            "type": "fill_blank",
            "difficulty": 2,
            "knowledge_point": "Python 基础",
            "content": {
                "stem": "Python 中用于获取列表长度的内置函数是____。",
                "answers": ["len", "len()", "len（）"],
            },
        },
        {
            "type": "fill_blank",
            "difficulty": 3,
            "knowledge_point": "异常处理",
            "content": {
                "stem": "Python 中捕获异常的关键字是____。",
                "answers": ["except"],
            },
        },
        {
            "type": "short_answer",
            "difficulty": 4,
            "knowledge_point": "面向对象",
            "content": {
                "stem": "请简述 Python 中「类」和「实例」的关系，并各举一个创建示例（伪代码即可）。",
                "reference": "类是对象的模板/蓝图，实例是根据类创建的具体对象。示例：class Dog:\n    pass\nd = Dog()",
                "rubric": "准确说明类与实例关系（40%）；给出类定义示例（30%）；给出实例化示例（30%）。",
            },
        },
        {
            "type": "short_answer",
            "difficulty": 4,
            "knowledge_point": "函数与作用域",
            "content": {
                "stem": "简述 Python 中 is 与 == 的区别，并说明各自适合的使用场景。",
                "reference": "is 判断对象身份（是否同一对象），== 判断值是否相等。数值/字符串比较用 ==，与 None 等单例比较用 is。",
                "rubric": "说明 is 语义（35%）；说明 == 语义（35%）；给出恰当使用场景（30%）。",
            },
        },
    ]


def seed():
    Base.metadata.create_all(bind=engine)
    db: Session = SessionLocal()

    # 清空旧数据（仅在明确的演示库中执行）
    from .models import AiTask, AuditLog, Grading

    for model in (Grading, Submission, ExamQuestion, Exam, Question, Enrollment, Course, AiTask, AuditLog, User):
        db.execute(model.__table__.delete())
    db.commit()

    # 用户
    users = {}
    for username, pwd, name, role in DEFAULT_USERS:
        u = User(username=username, password_hash=hash_password(pwd), name=name, role=role)
        db.add(u)
        users[username] = u
    db.flush()

    teacher = users["teacher1"]

    # 课程
    course = Course(name="Python 程序设计", description="面向大一学生的 Python 程序设计基础课程", teacher_id=teacher.id, assignment_weight=0.4)
    db.add(course)
    db.flush()

    for name in ("stu1", "stu2", "stu3"):
        db.add(Enrollment(course_id=course.id, student_id=users[name].id))
    db.flush()

    # 题库
    qs = []
    for q in _sample_questions(course.id):
        db_question = Question(course_id=course.id, created_by=teacher.id, **q)
        db.add(db_question)
        db.flush()
        qs.append(db_question)

    # 作业（已发布，含部分题目）
    assignment = Exam(course_id=course.id, title="第 1 次课后作业", kind="assignment", status="published", created_by=teacher.id)
    db.add(assignment)
    db.flush()
    for seq, q in enumerate([qs[0], qs[4], qs[6]]):
        db.add(ExamQuestion(exam_id=assignment.id, question_id=q.id, score=20 if q.type == "short_answer" else 10, seq=seq))

    # 期末考试（草稿，全部题目）
    exam = Exam(course_id=course.id, title="Python 程序设计 期末考试", kind="exam", status="draft", duration_minutes=90, created_by=teacher.id)
    db.add(exam)
    db.flush()
    SHORT_SCORE = 20.0
    n_short = sum(1 for q in qs if q.type == "short_answer")
    n_obj = len(qs) - n_short
    obj_score = round((100 - SHORT_SCORE * n_short) / n_obj, 1) if n_obj else 0
    for seq, q in enumerate(qs):
        score = SHORT_SCORE if q.type == "short_answer" else obj_score
        db.add(ExamQuestion(exam_id=exam.id, question_id=q.id, score=score, seq=seq))

    db.commit()
    db.refresh(exam)

    # stu1 的作业答卷（已提交并完成批阅）
    sub = Submission(
        exam_id=assignment.id,
        student_id=users["stu1"].id,
        status="submitted",
        answers={
            str(qs[0].id): 2,
            str(qs[4].id): "len",
            str(qs[6].id): "类是对象的模板，实例是根据类创建出的具体对象。例如 class Dog: pass 定义类，d = Dog() 创建实例。",
        },
    )
    db.add(sub)
    db.flush()
    process_submission(db, sub, assignment)

    # 主观题用模拟评分补上，使成绩完整
    from . import llm

    for g in sub.gradings:
        if g.score is None:
            q = db.get(Question, g.question_id)
            ans = sub.answers.get(str(q.id), "")
            r = llm.grade_subjective(q.content, str(ans), g.max_score)
            g.score = r["score"]
            g.feedback = r["feedback"]
            g.graded_by = "ai"
    from .services import recompute_total

    recompute_total(db, sub)

    db.commit()
    print("✅ 演示数据已生成。")
    print("默认账号：")
    for username, pwd, name, role in DEFAULT_USERS:
        print(f"   {role:8s} {username:10s} / {pwd:10s} （{name}）")
    print("课程：Python 程序设计（王老师）")
    db.close()


if __name__ == "__main__":
    seed()