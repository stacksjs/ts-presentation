// Supplemental control sequences derived from the Unicode mappings in KaTeX v0.16.22
// (https://github.com/KaTeX/KaTeX/blob/v0.16.22/src/symbols.js, MIT).
// See licenses/KaTeX-MIT.txt. The renderer uses Unicode and system fonts.

export type MathSymbolKind = 'binary' | 'relation' | 'punctuation' | 'identifier' | 'ordinary' | 'inner'
export type MathSymbol = readonly [glyph: string, kind: MathSymbolKind]

const math: Readonly<Record<string, MathSymbol>> = {
  And: ['&', 'binary'], Box: ['□', 'ordinary'], Bumpeq: ['≎', 'relation'],
  Cap: ['⋒', 'binary'], Cup: ['⋓', 'binary'], Diamond: ['◊', 'ordinary'],
  Doteq: ['≑', 'relation'], Finv: ['Ⅎ', 'ordinary'], Game: ['⅁', 'ordinary'],
  Join: ['⋈', 'relation'], Lleftarrow: ['⇚', 'relation'], Lsh: ['↰', 'relation'],
  P: ['¶', 'ordinary'], Rrightarrow: ['⇛', 'relation'], Rsh: ['↱', 'relation'],
  S: ['§', 'ordinary'], Subset: ['⋐', 'relation'], Supset: ['⋑', 'relation'],
  Vdash: ['⊩', 'relation'], Vvdash: ['⊪', 'relation'], amalg: ['⨿', 'binary'],
  approxeq: ['≊', 'relation'], asymp: ['≍', 'relation'], backepsilon: ['∍', 'relation'],
  backsim: ['∽', 'relation'], backsimeq: ['⋍', 'relation'], barwedge: ['⊼', 'binary'],
  because: ['∵', 'relation'], beth: ['ℶ', 'ordinary'], between: ['≬', 'relation'],
  bigcirc: ['◯', 'binary'], bigstar: ['★', 'ordinary'], bigtriangledown: ['▽', 'binary'],
  bigtriangleup: ['△', 'binary'], blacklozenge: ['⧫', 'ordinary'], blacksquare: ['■', 'ordinary'],
  blacktriangle: ['▲', 'ordinary'], blacktriangledown: ['▼', 'ordinary'], blacktriangleleft: ['◀', 'relation'],
  blacktriangleright: ['▶', 'relation'], bot: ['⊥', 'ordinary'], bowtie: ['⋈', 'relation'],
  boxdot: ['⊡', 'binary'], boxminus: ['⊟', 'binary'], boxplus: ['⊞', 'binary'],
  boxtimes: ['⊠', 'binary'], bullet: ['∙', 'binary'], bumpeq: ['≏', 'relation'],
  cdotp: ['⋅', 'punctuation'], centerdot: ['⋅', 'binary'], checkmark: ['✓', 'ordinary'],
  circeq: ['≗', 'relation'], circlearrowleft: ['↺', 'relation'], circlearrowright: ['↻', 'relation'],
  circledR: ['®', 'ordinary'], circledS: ['Ⓢ', 'ordinary'], circledast: ['⊛', 'binary'],
  circledcirc: ['⊚', 'binary'], circleddash: ['⊝', 'binary'], clubsuit: ['♣', 'ordinary'],
  complement: ['∁', 'ordinary'], curlyeqprec: ['⋞', 'relation'], curlyeqsucc: ['⋟', 'relation'],
  curlyvee: ['⋎', 'binary'], curlywedge: ['⋏', 'binary'], curvearrowleft: ['↶', 'relation'],
  curvearrowright: ['↷', 'relation'], dag: ['†', 'ordinary'], dagger: ['†', 'binary'],
  daleth: ['ℸ', 'ordinary'], dashleftarrow: ['⇠', 'relation'], dashrightarrow: ['⇢', 'relation'],
  dashv: ['⊣', 'relation'], ddag: ['‡', 'ordinary'], ddagger: ['‡', 'binary'],
  degree: ['°', 'ordinary'], diagdown: ['╲', 'ordinary'], diagup: ['╱', 'ordinary'],
  diamond: ['⋄', 'binary'], diamondsuit: ['♢', 'ordinary'], digamma: ['ϝ', 'ordinary'],
  divideontimes: ['⋇', 'binary'], doteq: ['≐', 'relation'], doteqdot: ['≑', 'relation'],
  dotplus: ['∔', 'binary'], doublebarwedge: ['⩞', 'binary'], doublecap: ['⋒', 'binary'],
  doublecup: ['⋓', 'binary'], downdownarrows: ['⇊', 'relation'], downharpoonleft: ['⇃', 'relation'],
  downharpoonright: ['⇂', 'relation'], eqcirc: ['≖', 'relation'], eqsim: ['≂', 'relation'],
  eqslantgtr: ['⪖', 'relation'], eqslantless: ['⪕', 'relation'], eth: ['ð', 'ordinary'],
  fallingdotseq: ['≒', 'relation'], flat: ['♭', 'ordinary'], frown: ['⌢', 'relation'],
  geqq: ['≧', 'relation'], geqslant: ['⩾', 'relation'], ggg: ['⋙', 'relation'],
  gggtr: ['⋙', 'relation'], gimel: ['ℷ', 'ordinary'], gnapprox: ['⪊', 'relation'],
  gneq: ['⪈', 'relation'], gneqq: ['≩', 'relation'], gnsim: ['⋧', 'relation'],
  gtrapprox: ['⪆', 'relation'], gtrdot: ['⋗', 'binary'], gtreqless: ['⋛', 'relation'],
  gtreqqless: ['⪌', 'relation'], gtrless: ['≷', 'relation'], gtrsim: ['≳', 'relation'],
  heartsuit: ['♡', 'ordinary'], hookleftarrow: ['↩', 'relation'], hookrightarrow: ['↪', 'relation'],
  hslash: ['ℏ', 'ordinary'], imageof: ['⊷', 'relation'], intercal: ['⊺', 'binary'],
  ldotp: ['.', 'punctuation'], leadsto: ['⇝', 'relation'], leftarrowtail: ['↢', 'relation'],
  leftharpoondown: ['↽', 'relation'], leftharpoonup: ['↼', 'relation'], leftleftarrows: ['⇇', 'relation'],
  leftrightarrows: ['⇆', 'relation'], leftrightharpoons: ['⇋', 'relation'], leftrightsquigarrow: ['↭', 'relation'],
  leftthreetimes: ['⋋', 'binary'], leqq: ['≦', 'relation'], leqslant: ['⩽', 'relation'],
  lessapprox: ['⪅', 'relation'], lessdot: ['⋖', 'binary'], lesseqgtr: ['⋚', 'relation'],
  lesseqqgtr: ['⪋', 'relation'], lessgtr: ['≶', 'relation'], lesssim: ['≲', 'relation'],
  lhd: ['⊲', 'binary'], lll: ['⋘', 'relation'], llless: ['⋘', 'relation'],
  lnapprox: ['⪉', 'relation'], lneq: ['⪇', 'relation'], lneqq: ['≨', 'relation'],
  lnot: ['¬', 'ordinary'], lnsim: ['⋦', 'relation'], looparrowleft: ['↫', 'relation'],
  looparrowright: ['↬', 'relation'], lozenge: ['◊', 'ordinary'], ltimes: ['⋉', 'binary'],
  maltese: ['✠', 'ordinary'], mathellipsis: ['…', 'inner'], mathsterling: ['£', 'ordinary'],
  measuredangle: ['∡', 'ordinary'], mho: ['℧', 'ordinary'], models: ['⊨', 'relation'],
  multimap: ['⊸', 'relation'], nLeftarrow: ['⇍', 'relation'], nLeftrightarrow: ['⇎', 'relation'],
  nRightarrow: ['⇏', 'relation'], nVDash: ['⊯', 'relation'], nVdash: ['⊮', 'relation'],
  natural: ['♮', 'ordinary'], ncong: ['≆', 'relation'], nearrow: ['↗', 'relation'],
  nexists: ['∄', 'ordinary'], ngeqq: ['≧̸', 'relation'], ngeqslant: ['⩾̸', 'relation'],
  ngtr: ['≯', 'relation'], nleftarrow: ['↚', 'relation'], nleftrightarrow: ['↮', 'relation'],
  nleqq: ['≦̸', 'relation'], nleqslant: ['⩽̸', 'relation'], nless: ['≮', 'relation'],
  nprec: ['⊀', 'relation'], npreceq: ['⋠', 'relation'], nrightarrow: ['↛', 'relation'],
  nsim: ['≁', 'relation'], nsucc: ['⊁', 'relation'], nsucceq: ['⋡', 'relation'],
  ntriangleleft: ['⋪', 'relation'], ntrianglelefteq: ['⋬', 'relation'], ntriangleright: ['⋫', 'relation'],
  ntrianglerighteq: ['⋭', 'relation'], nvDash: ['⊭', 'relation'], nvdash: ['⊬', 'relation'],
  nwarrow: ['↖', 'relation'], omicron: ['ο', 'identifier'], ominus: ['⊖', 'binary'],
  origof: ['⊶', 'relation'], oslash: ['⊘', 'binary'], pitchfork: ['⋔', 'relation'],
  pounds: ['£', 'ordinary'], prec: ['≺', 'relation'], precapprox: ['⪷', 'relation'],
  preccurlyeq: ['≼', 'relation'], preceq: ['⪯', 'relation'], precnapprox: ['⪹', 'relation'],
  precneqq: ['⪵', 'relation'], precnsim: ['⋨', 'relation'], precsim: ['≾', 'relation'],
  restriction: ['↾', 'relation'], rhd: ['⊳', 'binary'], rightarrowtail: ['↣', 'relation'],
  rightharpoondown: ['⇁', 'relation'], rightharpoonup: ['⇀', 'relation'], rightleftarrows: ['⇄', 'relation'],
  rightleftharpoons: ['⇌', 'relation'], rightrightarrows: ['⇉', 'relation'], rightsquigarrow: ['⇝', 'relation'],
  rightthreetimes: ['⋌', 'binary'], risingdotseq: ['≓', 'relation'], rtimes: ['⋊', 'binary'],
  searrow: ['↘', 'relation'], sharp: ['♯', 'ordinary'], shortmid: ['∣', 'relation'],
  shortparallel: ['∥', 'relation'], smallfrown: ['⌢', 'relation'], smallsmile: ['⌣', 'relation'],
  smile: ['⌣', 'relation'], spadesuit: ['♠', 'ordinary'], sphericalangle: ['∢', 'ordinary'],
  sqcap: ['⊓', 'binary'], sqcup: ['⊔', 'binary'], sqsubset: ['⊏', 'relation'],
  sqsubseteq: ['⊑', 'relation'], sqsupset: ['⊐', 'relation'], sqsupseteq: ['⊒', 'relation'],
  square: ['□', 'ordinary'], star: ['⋆', 'binary'], subseteqq: ['⫅', 'relation'],
  subsetneq: ['⊊', 'relation'], subsetneqq: ['⫋', 'relation'], succ: ['≻', 'relation'],
  succapprox: ['⪸', 'relation'], succcurlyeq: ['≽', 'relation'], succeq: ['⪰', 'relation'],
  succnapprox: ['⪺', 'relation'], succneqq: ['⪶', 'relation'], succnsim: ['⋩', 'relation'],
  succsim: ['≿', 'relation'], supseteqq: ['⫆', 'relation'], supsetneq: ['⊋', 'relation'],
  supsetneqq: ['⫌', 'relation'], surd: ['√', 'ordinary'], swarrow: ['↙', 'relation'],
  therefore: ['∴', 'relation'], thickapprox: ['≈', 'relation'], thicksim: ['∼', 'relation'],
  top: ['⊤', 'ordinary'], triangle: ['△', 'ordinary'], triangledown: ['▽', 'ordinary'],
  triangleleft: ['◃', 'binary'], trianglelefteq: ['⊴', 'relation'], triangleq: ['≜', 'relation'],
  triangleright: ['▹', 'binary'], trianglerighteq: ['⊵', 'relation'], twoheadleftarrow: ['↞', 'relation'],
  twoheadrightarrow: ['↠', 'relation'], unlhd: ['⊴', 'binary'], unrhd: ['⊵', 'binary'],
  upharpoonleft: ['↿', 'relation'], upharpoonright: ['↾', 'relation'], uplus: ['⊎', 'binary'],
  upuparrows: ['⇈', 'relation'], vDash: ['⊨', 'relation'], varkappa: ['ϰ', 'ordinary'],
  varnothing: ['∅', 'ordinary'], varpi: ['ϖ', 'identifier'], varpropto: ['∝', 'relation'],
  vartriangle: ['△', 'relation'], vartriangleleft: ['⊲', 'relation'], vartriangleright: ['⊳', 'relation'],
  varvdots: ['⋮', 'ordinary'], vdash: ['⊢', 'relation'], veebar: ['⊻', 'binary'],
  wp: ['℘', 'ordinary'], wr: ['≀', 'binary'], yen: ['¥', 'ordinary'],
  // Standardized Unicode variants and overlays for relations that use private-use TeX glyphs.
  gvertneqq: ['≩\uFE00', 'relation'], lvertneqq: ['≨\uFE00', 'relation'],
  varsubsetneq: ['⊊\uFE00', 'relation'], varsubsetneqq: ['⫋\uFE00', 'relation'],
  varsupsetneq: ['⊋\uFE00', 'relation'], varsupsetneqq: ['⫌\uFE00', 'relation'],
  nsubseteqq: ['⫅\u0338', 'relation'], nsupseteqq: ['⫆\u0338', 'relation'],
  nshortmid: ['∤', 'relation'], nshortparallel: ['∦', 'relation'],
}

// Mathtools relation macros and colonequals aliases use one atom per operator.
const colonRelations: Readonly<Record<string, string>> = {
  vcentcolon: '∶', dblcolon: '∷', coloneqq: '≔', Coloneqq: '⩴',
  coloneq: '∶−', Coloneq: '∷−', eqqcolon: '≕', Eqqcolon: '=∷',
  eqcolon: '∹', Eqcolon: '−∷', colonapprox: '∶≈', Colonapprox: '∷≈',
  colonsim: '∶∼', Colonsim: '∷∼', simcolon: '∼∶', simcoloncolon: '∼∷',
  approxcolon: '≈∶', approxcoloncolon: '≈∷',
}
const colonGlyphs = new Set(Object.values(colonRelations).filter(glyph => glyph.length === 1))
const aliases: Readonly<Record<string, string>> = {
  ratio: 'vcentcolon', coloncolon: 'dblcolon', colonequals: 'coloneqq', coloncolonequals: 'Coloneqq',
  equalscolon: 'eqqcolon', equalscoloncolon: 'Eqqcolon', colonminus: 'coloneq', coloncolonminus: 'Coloneq',
  minuscolon: 'eqcolon', minuscoloncolon: 'Eqcolon', coloncolonapprox: 'Colonapprox',
  coloncolonsim: 'Colonsim',
  Dagger: 'ddag', clubs: 'clubsuit', diamonds: 'diamondsuit', hearts: 'heartsuit',
  spades: 'spadesuit', bull: 'bullet', weierp: 'wp',
}

const legacy: Readonly<Record<string, MathSymbol>> = {
  minuso: ['⦵', 'ordinary'],
  alef: ['ℵ', 'ordinary'], alefsym: ['ℵ', 'ordinary'], copyright: ['©', 'ordinary'],
  exist: ['∃', 'ordinary'], infin: ['∞', 'ordinary'], isin: ['∈', 'relation'],
  image: ['ℑ', 'ordinary'], real: ['ℜ', 'ordinary'], mapsfrom: ['↤', 'relation'],
  lq: ['‘', 'ordinary'], rq: ['’', 'ordinary'],
  darr: ['↓', 'relation'], dArr: ['⇓', 'relation'], Darr: ['⇓', 'relation'],
  harr: ['↔', 'relation'], hArr: ['⇔', 'relation'], Harr: ['⇔', 'relation'],
  larr: ['←', 'relation'], lArr: ['⇐', 'relation'], Larr: ['⇐', 'relation'],
  lrarr: ['↔', 'relation'], lrArr: ['⇔', 'relation'], Lrarr: ['⇔', 'relation'],
  rarr: ['→', 'relation'], rArr: ['⇒', 'relation'], Rarr: ['⇒', 'relation'],
  uarr: ['↑', 'relation'], uArr: ['⇑', 'relation'], Uarr: ['⇑', 'relation'],
  plusmn: ['±', 'binary'], sdot: ['⋅', 'binary'],
  sub: ['⊂', 'relation'], sube: ['⊆', 'relation'], supe: ['⊇', 'relation'],
  Bbbk: ['𝕜', 'identifier'], Complex: ['ℂ', 'identifier'], cnums: ['ℂ', 'identifier'],
  N: ['ℕ', 'identifier'], natnums: ['ℕ', 'identifier'], Z: ['ℤ', 'identifier'],
  R: ['ℝ', 'identifier'], Reals: ['ℝ', 'identifier'], reals: ['ℝ', 'identifier'],
}

const text: Readonly<Record<string, string>> = {
  P: '¶', S: '§', checkmark: '✓', circledR: '®', dag: '†',
  ddag: '‡', degree: '°', i: 'ı', j: 'ȷ', lbrack: '[',
  ldots: '…', maltese: '✠', pounds: '£', rbrack: ']', textbardbl: '∥',
  textbraceleft: '{', textbraceright: '}', textdagger: '†', textdaggerdbl: '‡', textdegree: '°',
  textellipsis: '…', textemdash: '\u2014', textendash: '\u2013', textquotedblleft: '“', textquotedblright: '”',
  textquoteleft: '‘', textquoteright: '’', textsterling: '£', varvdots: '⋮', yen: '¥',
  copyright: '©', textregistered: '®', sect: '\u00a7', lq: '‘', rq: '’',
  vdots: '⋮',
}

const centeredGlyphs = new Set([
  ...[...Object.values(math), ...Object.values(legacy)]
    .filter(([, kind]) => kind === 'binary' || kind === 'relation')
    .map(([glyph]) => glyph),
  ...Object.values(colonRelations),
])

export function isCenteredGlyph(glyph: string): boolean {
  return centeredGlyphs.has(glyph)
}

export function unicodeColonRelation(glyph: string): MathSymbol | undefined {
  if (colonGlyphs.has(glyph)) return [glyph, 'relation']
}

export function isColonRelationCommand(name: string): boolean {
  const canonical = Object.hasOwn(aliases, name) ? aliases[name] : name
  return Object.hasOwn(colonRelations, canonical)
}

export function mathSymbol(name: string): MathSymbol | undefined {
  const canonical = Object.hasOwn(aliases, name) ? aliases[name] : name
  if (Object.hasOwn(colonRelations, canonical)) return [colonRelations[canonical], 'relation']
  if (Object.hasOwn(math, canonical)) return math[canonical]
  return Object.hasOwn(legacy, canonical) ? legacy[canonical] : undefined
}

export function textSymbol(token: string): string | undefined {
  if (token[0] !== '\\') return
  const name = token.slice(1)
  return Object.hasOwn(text, name) ? text[name] : undefined
}

// Built-in functions and aliases inhibited by \noexpand in KaTeX 0.19.1.
// User definitions, symbols, and TeX primitives use their own expansion rules.
export const katexExpandableCommands: ReadonlySet<string> = new Set([
  ...`
    @binrel @char AA Alpha Bbb Bbbk Beta Big Bigg Biggl Biggm Biggr Bigl Bigm Bigr Chi Colonapprox Coloneq
    Coloneqq Colonsim Complex Dagger Darr Epsilon Eqcolon Eqqcolon Eta H Harr Huge Iota KaTeX Kappa LARGE
    LaTeX Large Larr Lrarr Mu N Nu Omicron Overrightarrow Pr R Rarr Reals Rho Tau TeX Uarr Z Zeta aa above
    acute alef alefsym angl approxcolon approxcoloncolon arccos arcctg arcsin arctan arctg arg argmax
    argmin atop bar bcancel begin bf big bigcap bigcup bigg biggl biggm biggr bigl bigm bigodot bigoplus
    bigotimes bigr bigsqcup biguplus bigvee bigwedge binom bm bmod bold boldsymbol brace brack breve bull
    c cal cancel cfrac ch check choose clap clubs cnums colon colonapprox coloncolon coloncolonapprox
    coloncolonequals coloncolonminus coloncolonsim coloneq coloneqq colonequals colonminus colonsim color
    colorbox coprod copyright cos cosec cosh cot cotg coth csc ctg cth dArr darr dbinom dblcolon ddddot
    dddot ddot deg det dfrac diamonds dim dot emph empty end enskip enspace eqcolon eqqcolon equalscolon
    equalscoloncolon exist exp fbox fcolorbox footnotesize frac frak gcd genfrac global grave gvertneqq
    hArr harr hat hdashline hearts hline hom hphantom href htmlClass htmlData htmlId htmlStyle huge iiint
    iint image imath includegraphics inf infin injlim int intop isin it jmath ker lArr lBrace lang large
    larr lg lim liminf limsup llap llbracket llcorner ln log long lq lrArr lrarr lrcorner lvertneqq
    mapsfrom mathbb mathbf mathcal mathclap mathfrak mathit mathllap mathnormal mathreflectbox mathring
    mathrlap mathrm mathscr mathsf mathsfit mathstrut mathtt max medspace min minuscolon minuscoloncolon
    minuso mod natnums ne negmedspace negthickspace negthinspace neq newcommand newline ngeqq ngeqslant
    nleqq nleqslant not notin notni nshortmid nshortparallel nsubseteqq nsupseteqq oiiint oiint oint
    operatorname operatorname@ operatornamewithlimits ordinarycolon over overbrace overbracket overgroup
    overleftarrow overleftharpoon overleftrightarrow overline overlinesegment overrightarrow
    overrightharpoon overset phantom phase plim plusmn pmb pmod pod prod projlim providecommand qquad quad
    r rArr rBrace raisebox rang rarr ratio real reals reflectbox renewcommand rlap rm rq rrbracket rule
    scriptsize sdot sec sect sf sh simcolon simcoloncolon sin sinh sixptsize small smallint smash sout
    spades sqrt stackrel sub sube sum sup supe tag tan tanh tbinom text textbf textcircled textcolor
    textit textmd textnormal textregistered textrm textsf texttt textup tfrac tg th thetasym thickspace
    thinspace tilde tiny tt u uArr uarr ulcorner underbar underbrace underbracket undergroup
    underleftarrow underleftrightarrow underline underlinesegment underrightarrow underset urcorner url
    utilde v varDelta varGamma varLambda varOmega varPhi varPi varPsi varSigma varTheta varUpsilon varXi
    varinjlim varliminf varlimsup varprojlim varsubsetneq varsubsetneqq varsupsetneq varsupsetneqq
    vcentcolon vcenter vdots vec vphantom weierp widecheck widehat widetilde xLeftarrow xLeftrightarrow
    xRightarrow xcancel xhookleftarrow xhookrightarrow xleftarrow xleftequilibrium xleftharpoondown
    xleftharpoonup xleftrightarrow xleftrightharpoons xlongequal xmapsto xrightarrow xrightequilibrium
    xrightharpoondown xrightharpoonup xrightleftarrows xrightleftharpoons xtofrom xtwoheadleftarrow
    xtwoheadrightarrow
  `.trim().split(/\s+/),
  '!', '"', "'", ',', '.', ':', ';', '=', '>', '\\', '^', '`', '~',
])
