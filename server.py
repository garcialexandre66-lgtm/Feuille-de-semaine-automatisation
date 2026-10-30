"""Serveur local sans dépendance : interface et export du modèle ODS."""
import copy
import io
import json
import os
import shutil
import subprocess
import tempfile
import re
import zipfile
from http.cookies import SimpleCookie
import storage
from datetime import date, timedelta
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parent
T = 'urn:oasis:names:tc:opendocument:xmlns:table:1.0'
O = 'urn:oasis:names:tc:opendocument:xmlns:office:1.0'
X = 'urn:oasis:names:tc:opendocument:xmlns:text:1.0'
FIELDS = ['travel', 'tpe', 'regie', 'chantier', 'sav']


def validate(data):
    start = date.fromisoformat(data['week'])
    if start.weekday() != 0:
        raise ValueError('La semaine doit commencer un lundi.')
    if not isinstance(data.get('name'), str) or not 1 <= len(data['name'].strip()) <= 100:
        raise ValueError('Indiquez votre nom (100 caractères maximum).')
    if not isinstance(data.get('days'), list) or len(data['days']) != 7:
        raise ValueError('Sept journées sont nécessaires.')
    for day in data['days']:
        if not isinstance(day, list) or len(day) > 8:
            raise ValueError('Le modèle accepte 8 lignes par jour.')
        total = 0
        for item in day:
            for field in ['client', 'city']:
                if not isinstance(item.get(field), str) or len(item[field]) > 200:
                    raise ValueError('Client ou localité invalide.')
            for field in FIELDS:
                value = item.get(field)
                if type(value) is not int or not 0 <= value <= 1440:
                    raise ValueError('Les durées doivent être des minutes entières positives.')
                total += value
        if any(item.get('kind') in ('leave', 'sick', 'recovery') for item in day) and (len(day) != 1 or total != 0 or day[0]['client'] != {'leave':'Congé', 'sick':'Arrêt maladie', 'recovery':'Récupération'}[day[0]['kind']]):
            raise ValueError('Une absence doit être seule dans la journée et sans heures travaillées.')
        if total > 1440:
            raise ValueError('Une journée ne peut pas dépasser 24 heures.')
    return start


def validate_extras(state):
    for name in ('weekMeta', 'monthNotes', 'preferences'):
        if not isinstance(state.get(name, {}), dict):
            raise ValueError('Réglages invalides.')
    if len(state.get('monthNotes', {})) > 1200:
        raise ValueError('Trop de notes mensuelles.')
    for key, value in state.get('monthNotes', {}).items():
        if not re.fullmatch(r'\d{4}-(0[1-9]|1[0-2])', key) or not isinstance(value, str) or len(value) > 10000:
            raise ValueError('Note mensuelle invalide.')
    for key, value in state.get('weekMeta', {}).items():
        date.fromisoformat(key)
        if not isinstance(value, dict) or not isinstance(value.get('sentAt'), str) or not isinstance(value.get('signature'), str) or not re.fullmatch(r'[a-f0-9]{8}', value['signature']):
            raise ValueError('Statut de semaine invalide.')
    recovery = state.get('recovery')
    if recovery is not None:
        if not isinstance(recovery, dict) or not isinstance(recovery.get('weeks'), dict):
            raise ValueError('Compteur de récupération invalide.')
        date.fromisoformat(recovery['startDate'])
        opening = recovery.get('openingMinutes')
        if opening is not None and (type(opening) is not int or abs(opening) > 600000):
            raise ValueError('Solde de départ invalide.')
        for key, value in recovery['weeks'].items():
            if date.fromisoformat(key).weekday() != 0 or not isinstance(value, dict) or value.get('source') not in ('work', 'school') or type(value.get('credit')) is not int or not 0 <= value['credit'] <= 10080 or not isinstance(value.get('signature'), str) or not re.fullmatch(r'[a-f0-9]{8}', value['signature']) or not isinstance(value.get('confirmedAt'), str):
                raise ValueError('Crédit de récupération invalide.')
    school_dates = state.get('schoolDates', {})
    if not isinstance(school_dates, dict):
        raise ValueError('Planning école invalide.')
    for key, value in school_dates.items():
        date.fromisoformat(key)
        if value is not True:
            raise ValueError('Planning école invalide.')
    favorites = state.get('favorites', [])
    if not isinstance(favorites, list) or len(favorites) > 100:
        raise ValueError('Favoris invalides.')
    ids = set()
    for item in favorites:
        if not isinstance(item, dict) or not isinstance(item.get('id'), str) or not 1 <= len(item['id']) <= 100 or item['id'] in ids:
            raise ValueError('Favori invalide.')
        ids.add(item['id'])
        if not isinstance(item.get('client'), str) or not item['client'].strip() or len(item['client']) > 200 or not isinstance(item.get('city'), str) or len(item['city']) > 200 or type(item.get('travel')) is not int or not 0 <= item['travel'] <= 1440:
            raise ValueError('Favori invalide.')
    reminder = state.get('preferences', {}).get('fridayReminder', True)
    if type(reminder) is not bool:
        raise ValueError('Rappel invalide.')


def duration(minutes):
    return f'{minutes // 60} h {minutes % 60:02d}' if minutes else ''


def export_ods(data):
    start = validate(data)
    output = io.BytesIO()
    with zipfile.ZipFile(ROOT / 'templates/feuille-semaine.ods') as source:
        content = source.read('content.xml')
        for _, ns in ET.iterparse(io.BytesIO(content), events=['start-ns']):
            ET.register_namespace(*ns)
        tree = ET.fromstring(content)
        sheet = tree.find(f'.//{{{T}}}table')
        rows = sheet.findall(f'{{{T}}}table-row')

        def cells(row):
            # Expand only the 13 used columns; retain compressed empty tail.
            result = []
            for cell in list(row):
                row.remove(cell)
                count = int(cell.get(f'{{{T}}}number-columns-repeated', '1'))
                used = min(count, max(0, 13 - len(result)))
                for _ in range(used):
                    new = copy.deepcopy(cell)
                    new.attrib.pop(f'{{{T}}}number-columns-repeated', None)
                    row.append(new)
                    result.append(new)
                if count > used:
                    cell.set(f'{{{T}}}number-columns-repeated', str(count - used))
                    row.append(cell)
            return result

        def put(cell, text):
            for child in list(cell):
                cell.remove(child)
            for key in list(cell.attrib):
                if key.startswith('{' + O + '}') or key == f'{{{T}}}formula':
                    del cell.attrib[key]
            if text:
                cell.set(f'{{{O}}}value-type', 'string')
                ET.SubElement(cell, f'{{{X}}}p').text = text

        put(cells(rows[1])[0], 'Nom du technicien : ' + data['name'].strip())
        put(cells(rows[2])[0], f'Semaine du {start:%d/%m/%Y} au {start + timedelta(days=6):%d/%m/%Y}')
        for day_index, day in enumerate(data['days']):
            cumulative = 0
            for index, item in enumerate(day):
                line = cells(rows[5 + day_index * 8 + index])
                minutes = sum(item[k] for k in FIELDS)
                overtime = max(0, cumulative + minutes - 480) - max(0, cumulative - 480)
                cumulative += minutes
                values = [item['client'], item['city'], '', '', str(item['travel']) if item['travel'] else '',
                          *[duration(item[k]) for k in FIELDS[1:]], duration(minutes), duration(overtime)]
                for cell, value in zip(line[2:13], values):
                    put(cell, value)
        xml = ET.tostring(tree, encoding='utf-8', xml_declaration=True)
        with zipfile.ZipFile(output, 'w') as target:
            for info in source.infolist():
                target.writestr(info, xml if info.filename == 'content.xml' else source.read(info.filename))
    return output.getvalue()


def export_pdf(data):
    ods = export_ods(data)
    # Adapt print settings in a temporary copy; keep the supplied template intact.
    style_ns = 'urn:oasis:names:tc:opendocument:xmlns:style:1.0'
    prepared = io.BytesIO()
    with zipfile.ZipFile(io.BytesIO(ods)) as archive, zipfile.ZipFile(prepared, 'w') as output:
        for info in archive.infolist():
            content = archive.read(info.filename)
            if info.filename in ('content.xml', 'styles.xml'):
                for _, ns in ET.iterparse(io.BytesIO(content), events=['start-ns']):
                    ET.register_namespace(*ns)
                root = ET.fromstring(content)
                if info.filename == 'content.xml':
                    spreadsheet = root.find(f'.//{{{O}}}spreadsheet')
                    sheets = spreadsheet.findall(f'{{{T}}}table')
                    sheets[0].set(f'{{{T}}}print-ranges', 'Feuille_de_semaine.A1:Feuille_de_semaine.M61')
                    for sheet in sheets[1:]:
                        spreadsheet.remove(sheet)
                for prop in root.iter(f'{{{style_ns}}}page-layout-properties'):
                    prop.set(f'{{{style_ns}}}scale-to-pages', '1')
                for prop in root.iter(f'{{{style_ns}}}table-cell-properties'):
                    prop.set(f'{{{style_ns}}}shrink-to-fit', 'true')
                content = ET.tostring(root, encoding='utf-8', xml_declaration=True)
            output.writestr(info, content)
    ods = prepared.getvalue()
    binary = shutil.which('libreoffice') or shutil.which('soffice')
    if not binary:
        raise RuntimeError('LibreOffice doit être installé sur le serveur pour exporter le PDF.')
    with tempfile.TemporaryDirectory(prefix='asc-pdf-') as folder:
        work = Path(folder)
        source = work / 'feuille.ods'
        source.write_bytes(ods)
        try:
            run = subprocess.run([
                binary, '-env:UserInstallation=' + (work / 'profile').as_uri(),
                '--headless', '--convert-to', 'pdf:calc_pdf_Export',
                '--outdir', str(work), str(source)
            ], capture_output=True, timeout=60)
        except (OSError, subprocess.TimeoutExpired) as error:
            raise RuntimeError('La conversion PDF a échoué. Réessayez ou exportez le fichier ODS.') from error
        result = work / 'feuille.pdf'
        if run.returncode or not result.is_file():
            raise RuntimeError('LibreOffice n’a pas pu générer le PDF.')
        content = result.read_bytes()
        if not content.startswith(b'%PDF-'):
            raise RuntimeError('Le fichier généré n’est pas un PDF valide.')
        return content


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT / 'static'), **kwargs)

    def token(self):
        cookie = SimpleCookie()
        try:
            cookie.load(self.headers.get('Cookie', ''))
            return cookie['asc_session'].value if 'asc_session' in cookie else ''
        except Exception:
            return ''

    def json_response(self, status, data, cookie=None):
        body = json.dumps(data, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(body)))
        if cookie:
            self.send_header('Set-Cookie', cookie)
        self.end_headers()
        self.wfile.write(body)

    def end_headers(self):
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Referrer-Policy', 'same-origin')
        self.send_header('Content-Security-Policy', "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'")
        super().end_headers()

    def read_json(self):
        if self.headers.get('Content-Type', '').split(';')[0] != 'application/json':
            raise ValueError('Format JSON nécessaire.')
        size = int(self.headers.get('Content-Length', '0'))
        if not 0 < size <= 5_000_000:
            raise ValueError('Requête trop volumineuse ou vide.')
        return json.loads(self.rfile.read(size))

    def do_GET(self):
        if self.path == '/api/session':
            self.json_response(200, {'authenticated':storage.authenticated(self.token()), 'configured':storage.configured()})
        elif self.path == '/api/state':
            if not storage.authenticated(self.token()):
                self.json_response(401, {'error':'Connectez-vous pour retrouver vos semaines.'})
                return
            self.json_response(200, storage.read_state())
        elif self.path.startswith('/api/'):
            self.json_response(404, {'error':'Page inconnue.'})
        else:
            super().do_GET()

    def do_POST(self):
        # JSON content type + same-origin checks prevent cross-site mutations.
        origin = self.headers.get('Origin')
        if self.headers.get('Sec-Fetch-Site') == 'cross-site' or (origin and origin.split('://', 1)[-1] != self.headers.get('Host')):
            self.json_response(403, {'error':'Origine non autorisée.'})
            return
        if self.path == '/api/login':
            try:
                data = self.read_json()
                token, status = storage.login(data.get('code'), self.client_address[0])
                if token:
                    secure = '; Secure' if os.environ.get('ASC_COOKIE_SECURE', '1') != '0' else ''
                    self.json_response(200, {'ok':True}, f'asc_session={token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=86400{secure}')
                else:
                    self.json_response(status, {'error':{401:'Code incorrect.',429:'Trop de tentatives. Réessayez dans 15 minutes.',503:'Le code personnel doit être configuré sur le serveur.'}[status]})
            except (ValueError, TypeError, AttributeError):
                self.json_response(400, {'error':'Demande de connexion invalide.'})
            return
        if not storage.authenticated(self.token()):
            self.json_response(401, {'error':'Connectez-vous pour continuer.'})
            return
        if self.path == '/api/logout':
            storage.logout(self.token())
            self.json_response(200, {'ok':True}, 'asc_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0')
            return
        if self.path == '/api/state':
            try:
                data = self.read_json()
                state = data['store']
                if not isinstance(state, dict) or not isinstance(state.get('name'), str) or len(state['name']) > 100:
                    raise ValueError('Nom invalide.')
                if not isinstance(state.get('weeks'), dict) or len(state['weeks']) > 1000:
                    raise ValueError('Historique invalide (1000 semaines maximum).')
                for week, days in state['weeks'].items():
                    validate({'name':state['name'] or 'Technicien', 'week':week, 'days':days})
                validate_extras(state)
                revision = data['revision']
                if type(revision) is not int or revision < 0:
                    raise ValueError('Révision invalide.')
                result = storage.write_state(state, revision)
                self.json_response(409 if result is None else 200, {'error':'Vos semaines ont été modifiées sur un autre appareil.'} if result is None else {'revision':result})
            except (ValueError, KeyError, TypeError, AttributeError):
                self.json_response(400, {'error':'Sauvegarde invalide.'})
            return
        if self.path not in ('/export', '/export/pdf'):
            self.send_error(404)
            return
        try:
            size = int(self.headers.get('Content-Length', '0'))
            if not 0 < size <= 100_000:
                raise ValueError('Requête trop volumineuse ou vide.')
            data = json.loads(self.rfile.read(size))
            result = export_pdf(data) if self.path == '/export/pdf' else export_ods(data)
        except (ValueError, KeyError, TypeError, AttributeError) as error:
            self.send_response(400)
            self.send_header('Content-Type', 'text/plain; charset=utf-8')
            self.end_headers()
            self.wfile.write(str(error).encode())
            return
        except RuntimeError as error:
            self.send_response(503)
            self.send_header('Content-Type', 'text/plain; charset=utf-8')
            self.end_headers()
            self.wfile.write(str(error).encode())
            return
        pdf = self.path == '/export/pdf'
        extension = 'pdf' if pdf else 'ods'
        self.send_response(200)
        self.send_header('Content-Type', 'application/pdf' if pdf else 'application/vnd.oasis.opendocument.spreadsheet')
        self.send_header('Content-Disposition', f'attachment; filename="semaine-{data["week"]}.{extension}"')
        self.send_header('Content-Length', str(len(result)))
        self.end_headers()
        self.wfile.write(result)


if __name__ == '__main__':
    import sys
    if '--set-code' in sys.argv:
        import getpass
        first = getpass.getpass('Nouveau code personnel (8 caractères minimum) : ')
        second = getpass.getpass('Confirmer le code : ')
        if first != second:
            raise SystemExit('Les codes sont différents.')
        storage.set_code(first)
        print('Code enregistré. Les sessions précédentes ont été fermées.')
        raise SystemExit(0)
    host, port = os.environ.get('HOST', '127.0.0.1'), int(os.environ.get('PORT', '8000'))
    print(f'Feuille de semaine — http://{host}:{port}', flush=True)
    ThreadingHTTPServer((host, port), Handler).serve_forever()
