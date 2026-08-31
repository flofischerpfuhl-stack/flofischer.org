export const project = {
  slug: 'vorsehung-freier-wille',
  title: 'Vorsehung und freier Wille',
  articleUrl: 'https://seele.flofischer.org/posts/vorsehung-freier-wille.html',
  issue: 'SEELENFRAGEN · I',
  voiceover:
    'Wenn Gott schon heute weiß, was du morgen entscheidest – bist du dann wirklich frei? Genau hier beginnt das Problem von Vorsehung und freiem Willen. Der Artikel zeigt, wo klassische Antworten an Grenzen stoßen – und warum Gottes Wissen vielleicht ganz anders gedacht werden muss.',
  cues: [
    {from: 0, to: 74, eyebrow: 'SEELENFRAGEN · I', text: 'VORSEHUNG &\nFREIER WILLE'},
    {from: 60, to: 235, eyebrow: 'DIE FRAGE', text: 'WENN GOTT ES WEISS —\nBIST DU DANN FREI?'},
    {from: 215, to: 355, eyebrow: 'DAS PROBLEM', text: 'WISSEN\nODER FREIHEIT?'},
    {from: 335, to: 480, eyebrow: 'KLASSISCHE ANTWORTEN', text: 'WO DIE ERKLÄRUNGEN\nAN GRENZEN STOSSEN'},
    {from: 455, to: 565, eyebrow: 'EIN ANDERER GEDANKE', text: 'GOTTES WISSEN\nNEU DENKEN'},
    {from: 550, to: 600, eyebrow: 'DEN GANZEN ARTIKEL', text: 'SEELE.FLOFISCHER.ORG'}
  ]
} as const;

export type Variant = 'editorial' | 'sculpture' | 'sunrise' | 'minimal' | 'manuscript';
