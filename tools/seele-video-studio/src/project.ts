export type SkyVariant = 'pink' | 'blue' | 'dark';

export const skyAssets: Record<SkyVariant, string> = {
  pink: 'assets/skies/pink-editorial.png',
  blue: 'assets/skies/blue-editorial.png',
  dark: 'assets/skies/dark-editorial.png'
};

export const project = {
  slug: 'vorsehung-freier-wille',
  title: 'Vorsehung und freier Wille',
  articleUrl: 'https://seele.flofischer.org/posts/vorsehung-freier-wille.html',
  issue: 'SEELENFRAGEN · I',
  durationInFrames: 1200,
  voiceover:
    'Wenn Gott schon heute unfehlbar weiß, was du morgen entscheidest – kannst du dann wirklich anders handeln? Genau hier stoßen Vorsehung und freier Wille aufeinander. Im Molinismus kennt Gott jede mögliche Entscheidung. Bei Bañez wirkt er als bestimmende Ursache. Der Open Theism versteht die Zukunft dagegen als echten Entscheidungsbaum: Gott kennt jeden möglichen Weg, ohne die freie Wahl vorwegzunehmen. Doch ist das noch Allwissenheit? Und wie passen Prophetie, Judas oder Marias freies Ja dazu? Der vollständige Gedankengang steht auf seele.flofischer.org.',
  voiceAsset: 'audio/vorsehung-freier-wille-v002-de.wav',
  conceptAsset: 'assets/generated/angel-concept.png',
  realAsset: 'private-assets/painted-wooden-angel.glb',
  cloudTransitionAsset: 'assets/transitions/pink-cloud-bank-v2.png'
} as const;
