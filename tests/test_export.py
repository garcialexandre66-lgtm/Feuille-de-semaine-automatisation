import copy
import io
import unittest
import zipfile
import xml.etree.ElementTree as ET
from server import export_ods, T, X


class ExportTests(unittest.TestCase):
    def setUp(self):
        self.item = dict(client='Client & fils', city='Saint-Estève', travel=60, tpe=60, regie=0, chantier=360, sav=0)
        self.data = dict(name='Technicien test', week='2026-10-26', days=[[self.item, dict(self.item, travel=0, tpe=0, chantier=30)]] + [[] for _ in range(6)])

    def sheet(self, data):
        with zipfile.ZipFile(io.BytesIO(export_ods(data))) as z:
            self.assertIsNone(z.testzip())
            self.assertEqual(z.infolist()[0].filename, 'mimetype')
            self.assertEqual(z.read('mimetype'), b'application/vnd.oasis.opendocument.spreadsheet')
            self.assertIn('styles.xml', z.namelist())
            root = ET.fromstring(z.read('content.xml'))
        return root.find(f'.//{{{T}}}table').findall(f'{{{T}}}table-row')

    def text(self, row, col):
        return ''.join(list(row)[col-1].itertext())

    def test_daily_overtime_and_blank_bons(self):
        rows = self.sheet(self.data)
        self.assertIn('Technicien test', self.text(rows[1], 1))
        self.assertIn('01/11/2026', self.text(rows[2], 1))
        self.assertEqual(self.text(rows[5], 3), 'Client & fils')
        self.assertEqual(self.text(rows[5], 7), '60')
        self.assertEqual(self.text(rows[5], 8), '1 h 00')
        self.assertEqual(self.text(rows[5], 12), '8 h 00')
        self.assertEqual(self.text(rows[5], 13), '')
        self.assertEqual(self.text(rows[6], 12), '0 h 30')
        self.assertEqual(self.text(rows[6], 13), '0 h 30')
        for row in rows[5:7]:
            self.assertEqual(self.text(row, 5), '')
            self.assertEqual(self.text(row, 6), '')
        self.assertEqual(list(rows[5])[0].get(f'{{{T}}}number-rows-spanned'), '8')

    def test_37_hour_week_has_no_daily_overtime(self):
        self.data['days'] = [[dict(self.item, travel=0, tpe=0, chantier=h*60)] for h in [8, 8, 8, 7, 6]] + [[], []]
        rows = self.sheet(self.data)
        self.assertEqual(self.text(rows[5], 13), '')
        self.assertEqual(self.text(rows[29], 13), '')
        self.assertEqual(self.text(rows[37], 13), '')

    def test_nine_hour_day_has_one_hour_then_resets_next_day(self):
        self.data['days'] = [[dict(self.item, travel=0, tpe=0, chantier=h*60)] for h in [9, 8, 8, 7, 6]] + [[], []]
        rows = self.sheet(self.data)
        self.assertEqual(self.text(rows[5], 13), '1 h 00')
        self.assertEqual(self.text(rows[13], 13), '')
        self.assertEqual(self.text(rows[37], 13), '')

    def test_eighth_sunday_slot(self):
        self.data['days'][6] = [dict(self.item, travel=0, tpe=0, chantier=60)] * 8
        rows = self.sheet(self.data)
        self.assertEqual(self.text(rows[60], 12), '1 h 00')
        self.assertEqual(self.text(rows[60], 13), '')

    def test_absence_labels_and_zero_hours(self):
        for kind, label in [('leave', 'Congé'), ('sick', 'Arrêt maladie')]:
            item = dict(self.item, kind=kind, client=label, travel=0, tpe=0, chantier=0)
            self.data['days'][0] = [item]
            rows = self.sheet(self.data)
            self.assertEqual(self.text(rows[5], 3), label)
            for col in range(5, 14):
                self.assertEqual(self.text(rows[5], col), '')
            item['tpe'] = 480
            with self.assertRaises(ValueError):
                export_ods(self.data)
            item['tpe'] = 0
            self.data['days'][0].append(dict(self.item))
            with self.assertRaises(ValueError):
                export_ods(self.data)

    def test_invalid_payloads(self):
        for field, value in [('travel', -1), ('chantier', 1.5), ('tpe', True)]:
            data = copy.deepcopy(self.data)
            data['days'][0][0][field] = value
            with self.assertRaises(ValueError):
                export_ods(data)
        self.data['days'][0] = [self.item] * 9
        with self.assertRaises(ValueError):
            export_ods(self.data)


if __name__ == '__main__':
    unittest.main()
