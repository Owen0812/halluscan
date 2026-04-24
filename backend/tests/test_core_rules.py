import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from graph.agents import decide_verdict
from memory.store import retrieve_memories, save_memory
from tools.search import search_claim
from tools.violation_db import check_violations


class CoreRulesTest(unittest.TestCase):
    def test_violation_db_filters_material_context(self):
        self.assertEqual(check_violations("这款T恤采用100%纯棉面料，适合日常穿着。"), [])

    def test_violation_db_keeps_effect_guarantee(self):
        hits = check_violations("这款精华100%有效，7天美白。")
        words = {hit["word"] for hit in hits}
        self.assertTrue("100%" in words or "100%有效" in words)
        self.assertIn("7天美白", words)

    def test_decide_verdict_compliance_violation_wins(self):
        result = decide_verdict({
            "compliance_result": {
                "violations": [{"word": "第一", "type": "极限词", "law": "广告法第9条", "risk": "high"}],
                "risk_level": "high",
            },
            "factcheck_result": {"claims": [], "risk_level": "low"},
            "tone_result": {"exaggerations": [], "risk_level": "low"},
        })
        self.assertEqual(result.verdict, "违规")
        self.assertEqual(result.overall_risk, "high")

    def test_decide_verdict_all_low_is_compliant(self):
        result = decide_verdict({
            "compliance_result": {"violations": [], "risk_level": "low"},
            "factcheck_result": {"claims": [], "risk_level": "low"},
            "tone_result": {"exaggerations": [], "risk_level": "low"},
        })
        self.assertEqual(result.verdict, "合规")

    def test_search_without_key_degrades_to_empty(self):
        old_value = os.environ.pop("TAVILY_API_KEY", None)
        try:
            self.assertEqual(search_claim("全球销量第一"), [])
        finally:
            if old_value is not None:
                os.environ["TAVILY_API_KEY"] = old_value

    def test_memory_without_database_degrades_to_empty(self):
        old_value = os.environ.pop("DATABASE_URL", None)
        try:
            self.assertEqual(retrieve_memories("测试文案"), [])
            self.assertFalse(save_memory({"verdict": {"verdict": "合规"}}))
        finally:
            if old_value is not None:
                os.environ["DATABASE_URL"] = old_value


if __name__ == "__main__":
    unittest.main()
