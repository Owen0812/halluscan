"""
Baseline 2：单 Agent 直接判断
一次 LLM 调用，无工具、无多Agent，直接让模型判断是否违规
对比点：体现 Multi-Agent 架构的价值
"""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), "..", "backend", "config", ".env"))

from langchain_openai import ChatOpenAI

llm = ChatOpenAI(
    model="qwen-plus",
    base_url="https://dashscope.aliyuncs.com/compatible-mode/v1",
    api_key=os.environ["DASHSCOPE_API_KEY"],
    temperature=0,
)

PROMPT = """你是广告法合规审核专家。请判断以下营销文案是否违规。

文案：{text}

只回复 JSON：{{"verdict": "违规"}} 或 {{"verdict": "合规"}}"""


def predict(text: str) -> str:
    import json, re
    resp = llm.invoke(PROMPT.format(text=text))
    content = resp.content.strip()
    # 提取 JSON
    match = re.search(r'\{.*?\}', content, re.DOTALL)
    if match:
        try:
            return json.loads(match.group())["verdict"]
        except Exception:
            pass
    # 降级：关键词判断
    return "违规" if "违规" in content else "合规"


if __name__ == "__main__":
    samples = [
        "本品绝对是市面上最好的产品，效果第一无可替代",
        "这款面霜质地轻薄，适合混合型肌肤日常使用",
    ]
    for s in samples:
        print(f"[{predict(s)}] {s[:40]}...")
