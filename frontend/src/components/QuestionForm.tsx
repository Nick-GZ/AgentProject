import { useEffect } from "react";
import { Button, Form, Input, InputNumber, Modal, Radio, Select, Slider, Space, message } from "antd";
import { MinusCircleOutlined, PlusOutlined } from "@ant-design/icons";
import { api, Question, QUESTION_TYPES } from "../api";

/** 新建 / 编辑题目的弹窗表单。不同类型显示不同字段。 */
export default function QuestionForm({
  courseId,
  open,
  initial,
  onDone,
  onCancel,
}: {
  courseId: number;
  open: boolean;
  initial: Question | null;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [form] = Form.useForm();
  const type = Form.useWatch("type", form) || "single_choice";
  const options = Form.useWatch("options", form) || [];

  useEffect(() => {
    if (!open) return;
    if (initial) {
      const c = initial.content || {};
      form.setFieldsValue({
        type: initial.type,
        difficulty: initial.difficulty,
        knowledge_point: initial.knowledge_point,
        stem: c.stem,
        options: c.options || [],
        answer: c.answer,
        answers: c.answers || [],
        reference: c.reference,
        rubric: c.rubric,
      });
    } else {
      form.setFieldsValue({
        type: "single_choice",
        difficulty: 3,
        knowledge_point: "",
        stem: "",
        options: ["", "", "", ""],
        answer: 0,
        answers: [],
        reference: "",
        rubric: "",
      });
    }
  }, [open, initial]);

  const submit = async () => {
    const v = await form.validateFields();
    const content: any = { stem: v.stem };
    if (v.type === "single_choice") {
      content.options = v.options || [];
      content.answer = v.answer;
    } else if (v.type === "multi_choice") {
      content.options = v.options || [];
      content.answer = v.answer || [];
    } else if (v.type === "true_false") {
      content.answer = v.answer;
    } else if (v.type === "fill_blank") {
      content.answers = (v.answers || []).map((s: string) => s.trim()).filter(Boolean);
    } else {
      content.reference = v.reference || "";
      content.rubric = v.rubric || "";
    }
    const payload = { type: v.type, difficulty: v.difficulty, knowledge_point: v.knowledge_point, content };
    try {
      if (initial) await api.put(`/questions/${initial.id}`, payload);
      else await api.post(`/courses/${courseId}/questions`, payload);
      message.success(initial ? "题目已更新" : "题目已添加");
      onDone();
    } catch (e: any) {
      message.error(e.message);
    }
  };

  const optionChoices = (options || []).map((o: string, i: number) => ({
    label: `${String.fromCharCode(65 + i)}. ${o || `选项 ${i + 1}`}`,
    value: i,
  }));

  return (
    <Modal
      title={initial ? "编辑题目" : "新增题目"}
      open={open}
      onOk={submit}
      onCancel={onCancel}
      width={640}
      destroyOnClose
    >
      <Form form={form} layout="vertical">
        <Form.Item name="type" label="题型" rules={[{ required: true }]}>
          <Select options={Object.entries(QUESTION_TYPES).map(([value, label]) => ({ value, label }))} />
        </Form.Item>
        <Form.Item name="difficulty" label="难度">
          <Slider min={1} max={5} marks={{ 1: "很易", 2: "较易", 3: "中等", 4: "较难", 5: "很难" }} />
        </Form.Item>
        <Form.Item name="knowledge_point" label="知识点">
          <Input placeholder="如：循环、函数、面向对象…" />
        </Form.Item>
        <Form.Item name="stem" label={type === "true_false" ? "陈述句" : "题干"} rules={[{ required: true, message: "请输入题干" }]}>
          <Input.TextArea rows={2} />
        </Form.Item>

        {(type === "single_choice" || type === "multi_choice") && (
          <>
            <Form.Item label={`选项（${type === "multi_choice" ? "多选题，答案可多选" : "单选题"}）`} required>
              <Form.List name="options">
                {(fields, { add, remove }) => (
                  <>
                    {fields.map((field, i) => (
                      <Space key={field.key} align="baseline" style={{ display: "flex", marginBottom: 6 }}>
                        <span style={{ width: 20 }}>{String.fromCharCode(65 + i)}.</span>
                        <Form.Item name={field.name} noStyle rules={[{ required: true, message: "选项不能为空" }]}>
                          <Input style={{ width: 420 }} placeholder="选项内容" />
                        </Form.Item>
                        <Button type="text" icon={<MinusCircleOutlined />} onClick={() => remove(field.name)} />
                      </Space>
                    ))}
                    <Button type="dashed" onClick={() => add()} icon={<PlusOutlined />} block>
                      添加选项
                    </Button>
                  </>
                )}
              </Form.List>
            </Form.Item>
            <Form.Item
              name="answer"
              label="正确答案"
              rules={[{ required: true, message: "请选择正确答案" }]}
            >
              <Select
                mode={type === "multi_choice" ? "multiple" : undefined}
                options={optionChoices}
                placeholder="选择正确选项"
              />
            </Form.Item>
          </>
        )}

        {type === "true_false" && (
          <Form.Item name="answer" label="正确答案" rules={[{ required: true }]}>
            <Radio.Group
              options={[
                { label: "正确", value: true },
                { label: "错误", value: false },
              ]}
            />
          </Form.Item>
        )}

        {type === "fill_blank" && (
          <Form.Item name="answers" label="可接受的答案（可填多个，判分时命中其一即可）" rules={[{ required: true }]}>
            <Select mode="tags" placeholder="输入答案后回车添加" open={false} />
          </Form.Item>
        )}

        {type === "short_answer" && (
          <>
            <Form.Item name="reference" label="参考答案">
              <Input.TextArea rows={3} placeholder="供大模型批阅时参考的标准答案要点" />
            </Form.Item>
            <Form.Item name="rubric" label="评分标准">
              <Input.TextArea rows={2} placeholder="如：概念准确（40%）；应用恰当（30%）…" />
            </Form.Item>
          </>
        )}
      </Form>
    </Modal>
  );
}