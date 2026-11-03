"""No model download required: adversarial validation + actual HTTP boundary checks."""
import importlib.util
import json
import threading
import unittest
import urllib.request
import urllib.error
from pathlib import Path
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('local_server', Path(__file__).resolve().parents[1] / 'local_ai/server.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


class LocalAITests(unittest.TestCase):
    def setUp(self):
        self.packet = {'question': 'How uncertain is the result?', 'evidence': {t: ['Computed fact.', 'Limitation: association is not causation.'] for t in m.TOPICS}}

    def test_grounded_selection_preserves_all_caveats(self):
        topic, lines = m.validate_plan({'topic': 'uncertainty', 'evidence_ids': [0], 'abstain': False}, self.packet['evidence'])
        self.assertEqual(topic, 'uncertainty')
        self.assertEqual(lines, self.packet['evidence']['uncertainty'])

    def test_rejects_fabricated_prose_and_ids(self):
        for bad in [dict(topic='result', evidence_ids=[0], abstain=False, claim='This causes a cure'),
                    dict(topic='result', evidence_ids=[999], abstain=False),
                    dict(topic='result', evidence_ids=[True], abstain=False),
                    dict(topic='result', evidence_ids=[0, 0], abstain=False),
                    dict(topic='fiction', evidence_ids=[0], abstain=False),
                    dict(topic='result', evidence_ids=[], abstain=False),
                    dict(topic='result', evidence_ids=[0], abstain=True)]:
            with self.subTest(bad=bad), self.assertRaises(ValueError):
                m.validate_plan(bad, self.packet['evidence'])

    def test_causal_request_never_calls_model(self):
        self.packet['question'] = 'Prove this causes improvement'
        def forbidden(*_):
            self.fail('Model called for a refused request')
        self.assertEqual(m.answer(self.packet, 'model', forbidden)['status'], 'refused')

    def test_bad_output_and_unavailable_model_fallback(self):
        self.assertEqual(m.answer(self.packet, 'model', lambda *_: {'claim': 'invented 99%'})['status'], 'fallback')
        def unavailable(*_):
            raise OSError('not running')
        self.assertEqual(m.answer(self.packet, 'model', unavailable)['lines'][1:], self.packet['evidence']['result'])

    def test_request_shape_and_limits(self):
        for packet in [{}, {'question': 'q', 'evidence': {}}, {**self.packet, 'rows': [[1, 2]]}, {**self.packet, 'question': 'q' * 301}]:
            with self.assertRaises(ValueError):
                m.validate_packet(packet)

    def test_http_host_origin_token_and_no_cors(self):
        with m.make_server(0, 'gemma4:latest') as server:
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()
            base = 'http://' + server.authority
            try:
                with urllib.request.urlopen(base + '/') as response:
                    html = response.read().decode()
                    self.assertIn('window.EKM_LOCAL=', html)
                    self.assertIn(server.token, html)
                    self.assertIsNone(response.headers.get('Access-Control-Allow-Origin'))
                for origin, token, code in [('http://evil.test', server.token, 403), (base, 'wrong', 403)]:
                    req = urllib.request.Request(base + '/api/explain', data=json.dumps(self.packet).encode(), headers={'Content-Type': 'application/json', 'Origin': origin, 'X-EKM-Token': token})
                    with self.assertRaises(urllib.error.HTTPError) as error:
                        urllib.request.urlopen(req)
                    self.assertEqual(error.exception.code, code)
                req = urllib.request.Request(base + '/api/explain', data=json.dumps(self.packet).encode(), headers={'Content-Type': 'application/json', 'Origin': base, 'X-EKM-Token': server.token})
                with patch.object(m, 'ollama_plan', return_value={'topic': 'uncertainty', 'evidence_ids': [0], 'abstain': False}):
                    with urllib.request.urlopen(req) as response:
                        self.assertEqual(json.load(response)['status'], 'validated')
                bad_host = urllib.request.Request(base + '/', headers={'Host': 'evil.test'})
                with self.assertRaises(urllib.error.HTTPError) as error:
                    urllib.request.urlopen(bad_host)
                self.assertEqual(error.exception.code, 403)
            finally:
                server.shutdown()
                thread.join()


if __name__ == '__main__':
    unittest.main()
