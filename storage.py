"""Espace personnel, authentification et sauvegarde atomique SQLite."""
import hashlib
from contextlib import contextmanager
import hmac
import json
import os
import secrets
import sqlite3
import time
from pathlib import Path


@contextmanager
def database():
    path = Path(os.environ.get('ASC_DATA_DIR', Path(__file__).parent / 'data'))
    path.mkdir(parents=True, exist_ok=True, mode=0o700)
    db = sqlite3.connect(path / 'asc.sqlite3', timeout=15)
    db.execute('CREATE TABLE IF NOT EXISTS account (id INTEGER PRIMARY KEY CHECK(id=1), salt TEXT, digest TEXT, payload TEXT, revision INTEGER NOT NULL DEFAULT 0)')
    db.execute('CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, expires REAL)')
    db.execute('CREATE TABLE IF NOT EXISTS attempts (address TEXT PRIMARY KEY, count INTEGER, until REAL)')
    db.commit()
    try:
        with db:
            yield db
    finally:
        db.close()


def configured():
    with database() as db:
        return db.execute('SELECT 1 FROM account WHERE id=1').fetchone() is not None


def set_code(code):
    if not isinstance(code, str) or not 8 <= len(code) <= 128:
        raise ValueError('Choisissez un code de 8 à 128 caractères.')
    salt = secrets.token_hex(16)
    digest = hashlib.scrypt(code.encode(), salt=bytes.fromhex(salt), n=16384, r=8, p=1).hex()
    with database() as db:
        db.execute('INSERT INTO account(id,salt,digest,payload) VALUES(1,?,?,?) ON CONFLICT(id) DO UPDATE SET salt=excluded.salt,digest=excluded.digest', (salt, digest, json.dumps({'name':'','weeks':{}})))
        db.execute('DELETE FROM sessions')


def login(code, address):
    now = time.time()
    with database() as db:
        db.execute('BEGIN IMMEDIATE')
        attempt = db.execute('SELECT count,until FROM attempts WHERE address=?', (address,)).fetchone()
        if attempt and attempt[1] > now and attempt[0] >= 10:
            return None, 429
        account = db.execute('SELECT salt,digest FROM account WHERE id=1').fetchone()
        if not account:
            return None, 503
        valid = isinstance(code, str) and 8 <= len(code) <= 128
        digest = hashlib.scrypt((code if valid else '').encode(), salt=bytes.fromhex(account[0]), n=16384, r=8, p=1).hex()
        if not valid or not hmac.compare_digest(digest, account[1]):
            count = attempt[0] + 1 if attempt and attempt[1] > now else 1
            until = attempt[1] if attempt and attempt[1] > now else now + 900
            db.execute('INSERT OR REPLACE INTO attempts VALUES(?,?,?)', (address, count, until))
            return None, 401
        db.execute('DELETE FROM attempts WHERE address=?', (address,))
        token = secrets.token_urlsafe(32)
        db.execute('DELETE FROM sessions WHERE expires<?', (now,))
        db.execute('INSERT INTO sessions VALUES(?,?)', (hashlib.sha256(token.encode()).hexdigest(), now + 86400))
        return token, 200


def authenticated(token):
    if not token:
        return False
    with database() as db:
        return db.execute('SELECT 1 FROM sessions WHERE token=? AND expires>?', (hashlib.sha256(token.encode()).hexdigest(), time.time())).fetchone() is not None


def logout(token):
    with database() as db:
        db.execute('DELETE FROM sessions WHERE token=?', (hashlib.sha256(token.encode()).hexdigest(),))


def read_state():
    with database() as db:
        row = db.execute('SELECT payload,revision FROM account WHERE id=1').fetchone()
    return {'store':json.loads(row[0]), 'revision':row[1]}


def write_state(state, revision):
    with database() as db:
        cursor = db.execute('UPDATE account SET payload=?,revision=revision+1 WHERE id=1 AND revision=?', (json.dumps(state, ensure_ascii=False), revision))
        if cursor.rowcount != 1:
            return None
    return revision + 1
