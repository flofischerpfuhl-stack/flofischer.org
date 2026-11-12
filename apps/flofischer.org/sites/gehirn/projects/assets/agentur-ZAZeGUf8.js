const n=`{
  "format": "bergwork.company-preset",
  "version": 1,
  "id": "agentur",
  "name": "Agentur",
  "description": "Ablauf mit Freigabe beim Kunden, Kampagnen- und Website-Vorlage, Nummern „NL-2026-041“",
  "icon": "palette",
  "lang": "de",
  "workflow": [
    {
      "name": "Neu",
      "kind": "open",
      "icon": "inbox",
      "isDefault": true
    },
    {
      "name": "In Arbeit",
      "kind": "active"
    },
    {
      "name": "Beim Kunden",
      "kind": "waiting",
      "icon": "send",
      "color": "orange"
    },
    {
      "name": "Fertig",
      "kind": "done"
    }
  ],
  "kindLabels": {
    "waiting": "Beim Kunden",
    "done": "Fertig"
  },
  "naming": {
    "channel": "{Name}"
  },
  "modules": {
    "notes": false
  },
  "behavior": {
    "std.task-from-mail.complete-mail": {
      "enabled": false
    },
    "pref.mail.counts-as-open": {
      "enabled": false
    },
    "pref.inbox.hide-assigned": {
      "enabled": false
    }
  },
  "numberScheme": "NL-{JJJJ}-{NNN}",
  "folderPattern": "{Name} ({Nummer})",
  "folders": [
    {
      "name": "Briefing",
      "children": [],
      "role": "incoming"
    },
    {
      "name": "Entwürfe",
      "children": []
    },
    {
      "name": "Final",
      "children": []
    }
  ],
  "region": {
    "country": "none"
  },
  "attachmentRule": {
    "enabled": false,
    "path": "Briefing/{Datum} {Absender}",
    "skipInlineImages": true
  },
  "links": {
    "outlook": "owner",
    "sharedMailbox": true,
    "channel": true,
    "notes": "none"
  },
  "absenceCategories": [
    "Auszeit"
  ],
  "docTemplatesFolder": "Vorlagen",
  "categories": [
    {
      "displayName": "Freigabe nötig",
      "color": "preset1"
    },
    {
      "displayName": "Kunde wartet",
      "color": "preset0"
    },
    {
      "displayName": "Pitch",
      "color": "preset5"
    },
    {
      "displayName": "Buchhaltung",
      "color": "preset4"
    },
    {
      "displayName": "Freelancer",
      "color": "preset9"
    },
    {
      "displayName": "Auszeit",
      "color": "preset7"
    }
  ],
  "templates": [
    {
      "name": "Kampagne",
      "description": "Print, Social und Funk – vom Briefing bis zur Abrechnung",
      "icon": "megaphone",
      "iconColor": "pink",
      "folders": [
        {
          "name": "Briefing",
          "children": [
            {
              "name": "Kunde",
              "children": [],
              "role": "incoming"
            },
            {
              "name": "Intern",
              "children": []
            }
          ]
        },
        {
          "name": "Assets",
          "children": [
            {
              "name": "Fotos",
              "children": []
            },
            {
              "name": "Logos",
              "children": []
            },
            {
              "name": "Schriften",
              "children": []
            }
          ]
        },
        {
          "name": "Entwürfe",
          "children": [
            {
              "name": "Motion",
              "children": []
            }
          ]
        },
        {
          "name": "Final",
          "children": [
            {
              "name": "Print",
              "children": []
            },
            {
              "name": "Digital",
              "children": []
            }
          ]
        },
        {
          "name": "Rechnung",
          "children": []
        }
      ],
      "buckets": [
        {
          "name": "Briefing",
          "kind": "open",
          "icon": "inbox",
          "isDefault": true
        },
        {
          "name": "Konzept",
          "kind": "active",
          "icon": "lightbulb",
          "color": "yellow"
        },
        {
          "name": "Freigabe Kunde",
          "kind": "waiting",
          "icon": "hourglass",
          "color": "orange"
        },
        {
          "name": "Umsetzung",
          "kind": "active",
          "icon": "pen-tool",
          "color": "blue"
        },
        {
          "name": "In Produktion",
          "kind": "active",
          "icon": "package",
          "color": "brown",
          "actionable": false
        },
        {
          "name": "Freigegeben",
          "kind": "done",
          "icon": "badge-check"
        },
        {
          "name": "Abgerechnet",
          "kind": "done",
          "icon": "archive",
          "color": "grey"
        },
        {
          "name": "Verworfen",
          "kind": "canceled"
        }
      ],
      "tasks": [
        {
          "title": "Briefing aufnehmen",
          "bucket": 0,
          "color": "default",
          "notes": "",
          "assigneeRole": "lead"
        },
        {
          "title": "Moodboard",
          "bucket": 0,
          "color": "default",
          "notes": "",
          "assigneeRole": "artdirection"
        },
        {
          "title": "Konzept präsentieren",
          "bucket": 0,
          "color": "default",
          "notes": "",
          "assigneeRole": "lead"
        },
        {
          "title": "Reinzeichnung",
          "bucket": 0,
          "color": "default",
          "notes": "",
          "assigneeRole": "artdirection"
        },
        {
          "title": "Druckdaten an Produktion",
          "bucket": 0,
          "color": "default",
          "notes": "",
          "assigneeRole": "produktion"
        }
      ],
      "variables": [
        {
          "key": "marke",
          "label": "Marke",
          "type": "text",
          "value": ""
        },
        {
          "key": "budget",
          "label": "Budget",
          "type": "money",
          "value": "",
          "required": true
        },
        {
          "key": "kampagnenstart",
          "label": "Kampagnenstart",
          "type": "date",
          "value": ""
        },
        {
          "key": "kanaele",
          "label": "Kanäle",
          "type": "text",
          "value": ""
        }
      ],
      "roles": [
        {
          "key": "kunde",
          "label": "Kunde",
          "required": true
        },
        {
          "key": "artdirection",
          "label": "Art Direction",
          "kind": "person"
        },
        {
          "key": "freelancer",
          "label": "Freelancer",
          "kind": "person"
        },
        {
          "key": "fotografie",
          "label": "Fotografie"
        },
        {
          "key": "produktion",
          "label": "Produktion"
        }
      ],
      "mailDrafts": [
        {
          "to": "f{rollen.kunde.email}",
          "subject": "Briefing-Bestätigung f{projekt.name}",
          "body": "Hallo f{rollen.kunde.name},\\n\\ndanke für das Briefing zu f{variablen.marke}. Wir starten mit dem Moodboard und melden uns mit einem ersten Konzept.\\n\\nKampagnenstart: f{variablen.kampagnenstart}\\n\\nHerzliche Grüße\\nf{ich.name}\\nf{unternehmen.name}"
        }
      ],
      "attachmentRule": {
        "enabled": true,
        "path": "{Eingang}/{Datum} {Absender}",
        "skipInlineImages": true,
        "emptyFolders": false
      },
      "links": {
        "outlook": "team",
        "sharedMailbox": false,
        "channel": true,
        "notes": "none"
      },
      "budget": {
        "hours": 120
      }
    },
    {
      "name": "Social-Media-Betreuung",
      "description": "Monatliche Betreuung mit Redaktionsplan",
      "icon": "heart",
      "iconColor": "purple",
      "folders": [
        {
          "name": "Redaktionsplan",
          "children": []
        },
        {
          "name": "Assets",
          "children": []
        },
        {
          "name": "Posts",
          "children": []
        },
        {
          "name": "Reporting",
          "children": []
        }
      ],
      "buckets": [
        {
          "name": "Ideen",
          "kind": "open",
          "icon": "lightbulb",
          "color": "grey",
          "actionable": false
        },
        {
          "name": "Geplant",
          "kind": "open",
          "icon": "calendar-days",
          "isDefault": true
        },
        {
          "name": "In Produktion",
          "kind": "active"
        },
        {
          "name": "Beim Kunden",
          "kind": "waiting",
          "icon": "send",
          "color": "orange"
        },
        {
          "name": "Live",
          "kind": "done",
          "icon": "rocket",
          "color": "green"
        }
      ],
      "tasks": [
        {
          "title": "Redaktionsplan Monat",
          "bucket": 1,
          "color": "default",
          "notes": ""
        },
        {
          "title": "Reporting Vormonat",
          "bucket": 1,
          "color": "default",
          "notes": ""
        }
      ],
      "variables": [
        {
          "key": "kanaele",
          "label": "Kanäle",
          "type": "text",
          "value": ""
        },
        {
          "key": "posts",
          "label": "Posts pro Woche",
          "type": "number",
          "value": ""
        }
      ],
      "roles": [
        {
          "key": "kunde",
          "label": "Kunde",
          "required": true
        }
      ],
      "mailDrafts": [],
      "links": {
        "outlook": "owner",
        "sharedMailbox": false,
        "channel": false,
        "notes": "none"
      }
    }
  ]
}
`;export{n as default};
