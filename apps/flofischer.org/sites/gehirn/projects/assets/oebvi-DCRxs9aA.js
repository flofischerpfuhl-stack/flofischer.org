const n=`{
  "format": "bergwork.company-preset",
  "version": 1,
  "id": "oebvi",
  "name": "Vermessungsbüro (ÖbVI)",
  "description": "Ablauf, Projektvorlagen mit Gemarkung und Flurstück, Nummern „26-014“, Ordner 01_Eingang/02_Ausgang",
  "icon": "map",
  "lang": "de",
  "kindLabels": {
    "waiting": "Wartet extern"
  },
  "numberScheme": "{JJ}-{NNN}",
  "folders": [
    {
      "name": "01_Eingang",
      "children": [],
      "role": "incoming"
    },
    {
      "name": "02_Ausgang",
      "children": [],
      "role": "outgoing"
    }
  ],
  "absenceCategories": [],
  "docTemplatesFolder": "Vorlagen",
  "categories": [
    {
      "displayName": "Rechnung",
      "color": "preset4"
    },
    {
      "displayName": "Behörde",
      "color": "preset7"
    },
    {
      "displayName": "Termin",
      "color": "preset1"
    },
    {
      "displayName": "Wichtig",
      "color": "preset0"
    },
    {
      "displayName": "Warten auf Antwort",
      "color": "preset3"
    },
    {
      "displayName": "Privat",
      "color": "preset8"
    }
  ],
  "templates": [
    {
      "name": "Vermessungsprojekt",
      "description": "Standard für Lage-, Bestands- und Absteckungsaufträge",
      "icon": "map",
      "folders": [
        {
          "name": "01_Eingang",
          "children": [],
          "role": "incoming"
        },
        {
          "name": "02_Ausgang",
          "children": [],
          "role": "outgoing"
        },
        {
          "name": "03_Messung",
          "children": [
            {
              "name": "Absteckdaten",
              "children": []
            },
            {
              "name": "Messprotokolle",
              "children": []
            },
            {
              "name": "Bestandsaufnahme",
              "children": []
            }
          ]
        },
        {
          "name": "04_Planung",
          "children": [
            {
              "name": "Bestandsplan",
              "children": []
            },
            {
              "name": "Lageplan",
              "children": []
            },
            {
              "name": "Teilungsplan",
              "children": []
            },
            {
              "name": "Katasterauszüge",
              "children": []
            }
          ]
        },
        {
          "name": "05_Prüfung",
          "children": [
            {
              "name": "Reservierungen",
              "children": []
            },
            {
              "name": "Fortführungsnachweis",
              "children": []
            },
            {
              "name": "Flächenberechnung",
              "children": []
            },
            {
              "name": "Fortführungsriss",
              "children": []
            },
            {
              "name": "Eigentümernachweis",
              "children": []
            },
            {
              "name": "Beanstandungen",
              "children": []
            }
          ]
        },
        {
          "name": "06_Abgabe",
          "children": [
            {
              "name": "Teilungsanzeige",
              "children": []
            },
            {
              "name": "Abgabe VA",
              "children": []
            },
            {
              "name": "FN-Bekanntgabe",
              "children": []
            },
            {
              "name": "Beanstandungen VA",
              "children": []
            }
          ]
        },
        {
          "name": "07_Bilder",
          "children": []
        },
        {
          "name": "08_Rechnung",
          "children": [
            {
              "name": "Rechnungsentwurf",
              "children": []
            },
            {
              "name": "Rechnungen",
              "children": []
            }
          ]
        },
        {
          "name": "09_Software",
          "children": [
            {
              "name": "Agisoft",
              "children": []
            },
            {
              "name": "GeoTKF",
              "children": [
                {
                  "name": "Import",
                  "children": []
                },
                {
                  "name": "Export",
                  "children": []
                }
              ]
            },
            {
              "name": "CloudCompare",
              "children": [
                {
                  "name": "Import",
                  "children": []
                },
                {
                  "name": "Export",
                  "children": []
                }
              ]
            },
            {
              "name": "Cremer",
              "children": [
                {
                  "name": "Import",
                  "children": []
                },
                {
                  "name": "Export",
                  "children": []
                }
              ]
            },
            {
              "name": "VermCAD",
              "children": [
                {
                  "name": "Import",
                  "children": []
                },
                {
                  "name": "Export",
                  "children": []
                }
              ]
            },
            {
              "name": "BricsCAD",
              "children": []
            }
          ]
        },
        {
          "name": "10_Export",
          "children": [
            {
              "name": "99_Alt",
              "children": []
            }
          ]
        },
        {
          "name": "11_Dokumente",
          "children": []
        },
        {
          "name": "12_KI",
          "children": []
        },
        {
          "name": "99_Alt",
          "children": []
        }
      ],
      "buckets": [
        {
          "name": "Backlog",
          "kind": "open",
          "icon": "circle-dashed",
          "color": "grey"
        },
        {
          "name": "ToDo",
          "kind": "open",
          "isDefault": true
        },
        {
          "name": "In Bearbeitung",
          "kind": "active"
        },
        {
          "name": "Bearbeitung Extern",
          "kind": "waiting"
        },
        {
          "name": "Prüfung",
          "kind": "active",
          "icon": "eye",
          "color": "purple",
          "review": true
        },
        {
          "name": "Abgeschlossen",
          "kind": "done"
        }
      ],
      "tasks": [
        {
          "title": "DFK/NAS einholen",
          "bucket": 1,
          "color": "default",
          "notes": "",
          "assigneeRole": "lead"
        },
        {
          "title": "Baulasten und Kanalplan anfragen",
          "bucket": 1,
          "color": "default",
          "notes": "Anfrage an Baurechtsamt und Stadtwerke"
        },
        {
          "title": "Bestandsaufnahme",
          "bucket": 1,
          "color": "default",
          "notes": ""
        },
        {
          "title": "Bestandsplan zeichnen",
          "bucket": 0,
          "color": "default",
          "notes": ""
        },
        {
          "title": "Lageplan erstellen",
          "bucket": 0,
          "color": "default",
          "notes": "",
          "assigneeRole": "lead"
        },
        {
          "title": "Vorabsteckung",
          "bucket": 0,
          "color": "default",
          "notes": ""
        },
        {
          "title": "Schnurgerüst einschneiden",
          "bucket": 0,
          "color": "default",
          "notes": ""
        }
      ],
      "variables": [
        {
          "key": "gemarkung",
          "label": "Gemarkung",
          "type": "text",
          "value": "",
          "required": true
        },
        {
          "key": "flurstueck",
          "label": "Flurstück",
          "type": "text",
          "value": "",
          "required": true
        },
        {
          "key": "adresse",
          "label": "Objektadresse",
          "type": "address",
          "value": ""
        },
        {
          "key": "auftragswert",
          "label": "Auftragswert",
          "type": "money",
          "value": ""
        },
        {
          "key": "abgabe",
          "label": "Abgabetermin",
          "type": "date",
          "value": ""
        }
      ],
      "roles": [
        {
          "key": "auftraggeber",
          "label": "Auftraggeber",
          "required": true
        },
        {
          "key": "architekt",
          "label": "Architekt"
        },
        {
          "key": "rechnungsempfaenger",
          "label": "Rechnungsempfänger"
        },
        {
          "key": "behoerde",
          "label": "Vermessungsbehörde"
        }
      ],
      "mailDrafts": [
        {
          "to": "f{rollen.auftraggeber.email}",
          "subject": "Auftragsbestätigung f{projekt.nummer} – f{projekt.name}",
          "body": "Guten Tag f{rollen.auftraggeber.name},\\n\\nvielen Dank für Ihren Auftrag. Wir bestätigen die Vermessung für f{variablen.adresse} (Gemarkung f{variablen.gemarkung}, Flst. f{variablen.flurstueck}).\\n\\nUnser Projektzeichen: f{projekt.nummer}\\nVoraussichtliche Abgabe: f{variablen.abgabe}\\n\\nMit freundlichen Grüßen\\nf{ich.name}\\nf{unternehmen.name}"
        },
        {
          "to": "f{rollen.behoerde.email}",
          "subject": "Anfrage Baulasten und Kanalplan – Flst. f{variablen.flurstueck}, f{variablen.gemarkung}",
          "body": "Sehr geehrte Damen und Herren,\\n\\nfür das Flurstück f{variablen.flurstueck} der Gemarkung f{variablen.gemarkung} bitten wir um Auskunft aus dem Baulastenverzeichnis sowie um den aktuellen Kanalbestandsplan.\\n\\nMit freundlichen Grüßen\\nf{ich.name}\\nf{unternehmen.name}"
        }
      ],
      "budget": {
        "hours": 40,
        "positions": [
          {
            "id": "tpos-ad",
            "name": "Außendienst",
            "serviceTypeId": "svc-aussen",
            "hours": 24
          },
          {
            "id": "tpos-id",
            "name": "Innendienst / Planung",
            "serviceTypeId": "svc-innen",
            "hours": 16
          }
        ]
      }
    },
    {
      "name": "Gebäudeeinmessung",
      "description": "Einmessung nach Fertigstellung, Übernahme ins Kataster",
      "icon": "home",
      "folders": [
        {
          "name": "01_Eingang",
          "children": [],
          "role": "incoming"
        },
        {
          "name": "02_Ausgang",
          "children": [],
          "role": "outgoing"
        },
        {
          "name": "03_Messung",
          "children": [
            {
              "name": "Messprotokolle",
              "children": []
            }
          ]
        },
        {
          "name": "05_Prüfung",
          "children": [
            {
              "name": "Fortführungsriss",
              "children": []
            }
          ]
        },
        {
          "name": "06_Abgabe",
          "children": []
        },
        {
          "name": "07_Bilder",
          "children": []
        },
        {
          "name": "08_Rechnung",
          "children": []
        }
      ],
      "buckets": [
        {
          "name": "Offen",
          "kind": "open",
          "isDefault": true
        },
        {
          "name": "Außendienst",
          "kind": "active"
        },
        {
          "name": "Beim Amt",
          "kind": "waiting"
        },
        {
          "name": "Erledigt",
          "kind": "done"
        }
      ],
      "tasks": [
        {
          "title": "Gebäude einmessen",
          "bucket": 0,
          "color": "default",
          "notes": ""
        },
        {
          "title": "Fortführungsriss erstellen",
          "bucket": 0,
          "color": "default",
          "notes": ""
        },
        {
          "title": "Übernahme beim Amt beantragen",
          "bucket": 0,
          "color": "default",
          "notes": ""
        }
      ],
      "variables": [
        {
          "key": "gemarkung",
          "label": "Gemarkung",
          "type": "text",
          "value": "",
          "required": true
        },
        {
          "key": "flurstueck",
          "label": "Flurstück",
          "type": "text",
          "value": "",
          "required": true
        },
        {
          "key": "adresse",
          "label": "Objektadresse",
          "type": "address",
          "value": ""
        }
      ],
      "roles": [
        {
          "key": "auftraggeber",
          "label": "Auftraggeber",
          "required": true
        }
      ],
      "mailDrafts": [],
      "attachmentRule": {
        "enabled": true,
        "path": "{Eingang}/{Datum} {Betreff}",
        "skipInlineImages": true
      },
      "links": {
        "outlook": "team",
        "sharedMailbox": true,
        "channel": true,
        "notes": "section"
      }
    }
  ]
}
`;export{n as default};
