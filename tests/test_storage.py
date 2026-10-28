import os
import tempfile
import unittest
from unittest.mock import patch
import storage


class StorageTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.env = patch.dict(os.environ, {'ASC_DATA_DIR':self.temp.name})
        self.env.start()
        storage.set_code('test-only-password')

    def tearDown(self):
        self.env.stop()
        self.temp.cleanup()

    def test_login_logout_and_code_reset(self):
        self.assertEqual(storage.login('incorrect', 'test')[1], 401)
        token, status = storage.login('test-only-password', 'test')
        self.assertEqual(status, 200)
        self.assertTrue(storage.authenticated(token))
        storage.logout(token)
        self.assertFalse(storage.authenticated(token))
        token, _ = storage.login('test-only-password', 'test')
        storage.set_code('another-test-password')
        self.assertFalse(storage.authenticated(token))
        self.assertEqual(storage.login('test-only-password', 'test')[1], 401)

    def test_conflict_and_persistence(self):
        self.assertEqual(storage.read_state()['revision'], 0)
        state = {'name':'Technicien', 'weeks':{}}
        self.assertEqual(storage.write_state(state, 0), 1)
        self.assertIsNone(storage.write_state({'name':'Stale', 'weeks':{}}, 0))
        self.assertEqual(storage.read_state(), {'store':state, 'revision':1})

    def test_rate_limit(self):
        for _ in range(10):
            self.assertEqual(storage.login('incorrect', 'test')[1], 401)
        self.assertEqual(storage.login('test-only-password', 'test')[1], 429)


if __name__ == '__main__':
    unittest.main()
