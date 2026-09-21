import json
import threading
import time
import unittest
import urllib.error
import urllib.request
from server import create_server, validate

SAMPLE = {"source": "INTEGRATION TEST / synthetic", "position": {"east": 2, "north": 3, "up": 4},
          "attitude": {"yaw": 90, "pitch": 12, "roll": -4}, "battery": 75, "speed": 1.2}


class ServerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = create_server(0, "test-token")
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.url = "http://127.0.0.1:%d" % cls.server.server_port

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join()

    def setUp(self):
        with self.server.state.lock:
            self.server.state.telemetry = None
            self.server.state.received = None
            self.server.state.frames.clear()
            self.server.state.count = 0

    def request(self, path, data=None, token="test-token", headers=None):
        head = {"Authorization": "Bearer " + token, **(headers or {})}
        body = json.dumps(data).encode() if data is not None and not isinstance(data, bytes) else data
        req = urllib.request.Request(self.url + path, data=body, headers=head)
        try:
            response = urllib.request.urlopen(req, timeout=3)
        except urllib.error.HTTPError as response:
            return response.code, response.read()
        with response:
            return response.status, response.read()

    def test_initial_state_has_no_fake_telemetry(self):
        status, body = self.request('/api/state')
        state = json.loads(body)
        self.assertEqual(status, 200)
        self.assertIsNone(state['telemetry'])
        self.assertFalse(state['connected'])

    def test_authenticated_ingestion(self):
        self.assertEqual(self.request('/api/telemetry', SAMPLE)[0], 200)
        state = json.loads(self.request('/api/state')[1])
        self.assertTrue(state['connected'])
        self.assertEqual(state['telemetry'], SAMPLE)

    def test_stale_state(self):
        self.request('/api/telemetry', SAMPLE)
        self.server.state.received = time.monotonic() - 4
        state = json.loads(self.request('/api/state')[1])
        self.assertFalse(state['connected'])
        self.assertEqual(state['telemetry'], SAMPLE)

    def test_token_required(self):
        self.assertEqual(self.request('/api/telemetry', SAMPLE, token='bad')[0], 401)

    def test_reject_nonlocal_host(self):
        self.assertEqual(self.request('/api/state', headers={'Host': 'evil.example'})[0], 403)

    def test_no_flight_endpoint(self):
        self.assertEqual(self.request('/api/arm', {})[0], 404)

    def test_bounded_input(self):
        self.assertEqual(self.request('/api/telemetry', b'x'*17000)[0], 413)

    def test_invalid_input(self):
        for data in ([], {}, {'source': 'test', 'position': None}, {'source': 123}, b'invalid'):
            self.assertEqual(self.request('/api/telemetry', data)[0], 400)

    def test_reject_nonfinite_and_boolean_coordinates(self):
        for value in (True, float('nan'), float('inf'), 10001, '2'):
            with self.assertRaises(ValueError):
                validate({**SAMPLE, 'position': {**SAMPLE['position'], 'east': value}})

    def test_optional_metrics_remain_unknown(self):
        data = validate({'source': 'test', 'position': SAMPLE['position']})
        self.assertIsNone(data['battery'])
        self.assertIsNone(data['speed'])

    def test_missing_and_stale_frames(self):
        self.assertEqual(self.request('/api/frame/rgb')[0], 404)
        self.server.state.frames['rgb'] = (b'\xff\xd8\xfftest\xff\xd9', time.monotonic()-4)
        self.assertEqual(self.request('/api/frame/rgb')[0], 404)

    def test_frame_endpoint_and_validation(self):
        self.assertEqual(self.request('/api/frame/rgb', b'not-jpeg')[0], 400)
        frame = b'\xff\xd8\xfftest\xff\xd9'
        self.assertEqual(self.request('/api/frame/rgb', frame)[0], 200)
        self.assertEqual(self.request('/api/frame/rgb')[1], frame)

    def test_static_and_no_source_disclosure(self):
        for path in ('/', '/app.js', '/vendor/three.module.js'):
            self.assertEqual(self.request(path)[0], 200)
        for path in ('/server.py', '/../server.py', '/%2e%2e/server.py'):
            self.assertEqual(self.request(path)[0], 404)


if __name__ == '__main__':
    unittest.main()
