import { Card, Tag } from "antd";
import { DIFFICULTY, QUESTION_TYPES } from "../api";

/** 学生作答输入区 / 教师审阅展示区共用的题目渲染卡片。 */
export function QuestionAnswerInput({
  q,
  value,
  onChange,
  disabled,
}: {
  q: any;
  value: any;
  onChange?: (v: any) => void;
  disabled?: boolean;
}) {
  const c = q.content || {};
  const inputProps = { disabled };
  return (
    <div>
      {c.stem != null && (
        <div style={{ marginBottom: 10, whiteSpace: "pre-wrap" }}>
          {q.type === "true_false" ? c.stem : c.stem}
        </div>
      )}
      {q.type === "single_choice" && (
        <RadioGroupOpts c={c} value={value} onChange={onChange} disabled={disabled} multiple={false} />
      )}
      {q.type === "multi_choice" && (
        <RadioGroupOpts c={c} value={value} onChange={onChange} disabled={disabled} multiple={true} />
      )}
      {q.type === "true_false" && (
        <BoolRadio value={value} onChange={onChange} disabled={disabled} />
      )}
      {q.type === "fill_blank" && (
        <input
          {...inputProps}
          value={value ?? ""}
          onChange={(e) => onChange?.(e.target.value)}
          placeholder="请填写答案"
          style={{ width: 320, padding: "4px 8px", border: "1px solid #d9d9d9", borderRadius: 6 }}
        />
      )}
      {q.type === "short_answer" && (
        <textarea
          {...inputProps}
          value={value ?? ""}
          onChange={(e) => onChange?.(e.target.value)}
          placeholder="请作答（答题内容将交由大模型按评分标准批阅）"
          rows={5}
          style={{ width: "100%", padding: 8, border: "1px solid #d9d9d9", borderRadius: 6 }}
        />
      )}
    </div>
  );
}

function RadioGroupOpts({ c, value, onChange, disabled, multiple }: any) {
  const opts: any[] = (c.options || []).map((o: string, i: number) => ({
    label: (
      <span>
        <b>{String.fromCharCode(65 + i)}.</b> {o}
      </span>
    ),
    value: i,
  }));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {opts.map((o) => {
        const checked = multiple ? (value || []).includes(o.value) : value === o.value;
        return (
          <label
            key={o.value}
            style={{ display: "flex", gap: 8, alignItems: "flex-start", cursor: disabled ? "default" : "pointer" }}
          >
            <input
              type={multiple ? "checkbox" : "radio"}
              disabled={disabled}
              checked={checked}
              onChange={() => {
                if (multiple) {
                  const next = new Set(value || []);
                  next.has(o.value) ? next.delete(o.value) : next.add(o.value);
                  onChange?.(Array.from(next).sort((a: number, b: number) => a - b));
                } else {
                  onChange?.(o.value);
                }
              }}
            />
            <span>{o.label}</span>
          </label>
        );
      })}
    </div>
  );
}

function BoolRadio({ value, onChange, disabled }: any) {
  return (
    <div style={{ display: "flex", gap: 16 }}>
      {[
        { label: "正确", v: true },
        { label: "错误", v: false },
      ].map((o) => (
        <label key={o.v} style={{ cursor: disabled ? "default" : "pointer" }}>
          <input
            type="radio"
            disabled={disabled}
            checked={value === o.v}
            onChange={() => onChange?.(o.v)}
            style={{ marginRight: 4 }}
          />
          {o.label}
        </label>
      ))}
    </div>
  );
}

/** 展示学生答案（用于审阅页，客观题高亮对错）。 */
export function AnswerDisplay({ q, value }: { q: any; value: any }) {
  const c = q.content || {};
  const correct = q.content?.answer ?? q.content?.answers;
  if (q.type === "single_choice" || q.type === "multi_choice" || q.type === "true_false" || q.type === "fill_blank") {
    const isCorrect = JSON.stringify(value) === JSON.stringify(
      q.type === "fill_blank" ? undefined : correct
    );
    let shown: string;
    if (q.type === "single_choice") shown = value == null ? "未作答" : `${String.fromCharCode(65 + value)}. ${c.options?.[value]}`;
    else if (q.type === "multi_choice") shown = !value?.length ? "未作答" : value.map((i: number) => String.fromCharCode(65 + i)).join("、");
    else if (q.type === "true_false") shown = value == null ? "未作答" : value ? "正确" : "错误";
    else shown = value ?? "未作答";
    return (
      <div>
        <span style={{ marginRight: 8 }}>作答：<b>{shown}</b></span>
        {q.type === "fill_blank" ? null : (
          <Tag color={isCorrect ? "success" : "error"}>{isCorrect ? "正确" : "错误"}</Tag>
        )}
        <div style={{ color: "#888", marginTop: 4 }}>
          参考答案：
          {q.type === "single_choice"
            ? `${String.fromCharCode(65 + correct)}. ${c.options?.[correct]}`
            : q.type === "multi_choice"
            ? correct.map((i: number) => String.fromCharCode(65 + i)).join("、")
            : q.type === "true_false"
            ? correct ? "正确" : "错误"
            : (c.answers || []).join(" / ")}
        </div>
      </div>
    );
  }
  return (
    <div style={{ whiteSpace: "pre-wrap" }}>
      <div>作答：{value || "未作答"}</div>
    </div>
  );
}

export function QuestionHeader({ q, index }: { q: any; index: number }) {
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8, flexWrap: "wrap" }}>
      <b>
        第 {index + 1} 题（{q.score ?? q.score_full ?? ""} 分）
      </b>
      <Tag>{QUESTION_TYPES[q.type] || q.type}</Tag>
      {q.difficulty && <Tag color="blue">{DIFFICULTY[q.difficulty] || "中等"}</Tag>}
      {q.knowledge_point && <Tag color="purple">{q.knowledge_point}</Tag>}
    </div>
  );
}

export function QuestionCard({ children, style }: any) {
  return <Card size="small" style={{ marginBottom: 12, ...style }}>{children}</Card>;
}