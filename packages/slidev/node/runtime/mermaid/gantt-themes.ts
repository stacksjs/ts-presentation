type ThemeColors = Readonly<Record<string, string>>

// Calculated Gantt colors from Mermaid 12.3.0, normalized to hex.
// See licenses/Mermaid-MIT.txt.
const common = {
  background: '#ffffff', altSectionBkgColor: '#ffffff',
  excludeBkgColor: '#eeeeee', gridColor: '#d3d3d3',
  doneTaskBkgColor: '#d3d3d3', doneTaskBorderColor: '#808080',
  critBkgColor: '#ff0000', critBorderColor: '#ff8888',
  taskTextClickableColor: '#003163', todayLineColor: '#ff0000', vertLineColor: '#000080',
}

const neo = {
  ...common,
  titleColor: '#000000', textColor: '#333333',
  sectionBkgColor: '#ffffff', sectionBkgColor2: '#ececfe',
  taskBkgColor: '#ececfe', taskBorderColor: '#b3b3b3',
  activeTaskBkgColor: '#ffffff', activeTaskBorderColor: '#ececfe',
  taskTextColor: '#333333', taskTextDarkColor: '#333333', taskTextOutsideColor: '#333333',
  vertLineColor: '#b3b3b3',
}

const neoDark = {
  ...common,
  background: '#333333', titleColor: '#dfe0e0', textColor: '#cccccc',
  sectionBkgColor: '#201f1f', sectionBkgColor2: '#1f2020',
  taskBkgColor: '#1f2020', taskBorderColor: '#cccccc',
  activeTaskBkgColor: '#595c5c', activeTaskBorderColor: '#1f2020', doneTaskBkgColor: '#584343',
  taskTextColor: '#cccccc', taskTextDarkColor: '#cccccc', taskTextOutsideColor: '#cccccc',
  vertLineColor: '#cccccc',
}

const redux = {
  ...neo,
  textColor: '#28253d', taskTextColor: '#28253d',
  taskTextDarkColor: '#28253d', taskTextOutsideColor: '#28253d',
  taskBorderColor: '#171717', vertLineColor: '#171717',
}

const reduxDark = { ...neoDark, doneTaskBkgColor: '#38383e' }
const coloredSections = { sectionBkgColor: '#f4a8ff', sectionBkgColor2: '#46ecd5' }

const presets: Readonly<Record<string, ThemeColors>> = {
  base: {
    ...common,
    background: '#f4f4f4', titleColor: '#090600', textColor: '#333333',
    sectionBkgColor: '#f6f9ff', sectionBkgColor2: '#fff4dd',
    taskBkgColor: '#fff4dd', taskBorderColor: '#eeddbb',
    activeTaskBkgColor: '#ffffff', activeTaskBorderColor: '#fff4dd',
    taskTextColor: '#333333', taskTextDarkColor: '#333333', taskTextOutsideColor: '#333333',
  },
  default: {
    ...common,
    titleColor: '#333333', textColor: '#333333',
    sectionBkgColor: '#6666ff7d', sectionBkgColor2: '#fff400',
    taskBkgColor: '#8a90dd', taskBorderColor: '#534fbc',
    activeTaskBkgColor: '#bfc7ff', activeTaskBorderColor: '#534fbc',
    taskTextColor: '#ffffff', taskTextDarkColor: '#000000', taskTextOutsideColor: '#000000',
  },
  dark: {
    ...common,
    background: '#333333', altSectionBkgColor: '#333333',
    titleColor: '#f9fffe', textColor: '#cccccc',
    sectionBkgColor: '#b4ac76', sectionBkgColor2: '#eae8d9', excludeBkgColor: '#9f9758',
    taskBkgColor: '#595c5c', taskBorderColor: '#ffffff',
    activeTaskBkgColor: '#81b1db', activeTaskBorderColor: '#ffffff',
    critBkgColor: '#e83737', critBorderColor: '#e83737',
    taskTextColor: '#e2dcd6', taskTextDarkColor: '#2c2c2c', taskTextOutsideColor: '#d3d3d3',
    todayLineColor: '#db5757', vertLineColor: '#00bfff',
  },
  forest: {
    ...common,
    titleColor: '#333333', textColor: '#000000',
    sectionBkgColor: '#6eaa49', sectionBkgColor2: '#6eaa49',
    taskBkgColor: '#487e3a', taskBorderColor: '#13540c',
    activeTaskBkgColor: '#cde498', activeTaskBorderColor: '#13540c',
    taskTextColor: '#ffffff', taskTextDarkColor: '#000000', taskTextOutsideColor: '#000000',
    vertLineColor: '#00bfff',
  },
  neutral: {
    ...common,
    titleColor: '#333333', textColor: '#000000',
    sectionBkgColor: '#bdbdbd', sectionBkgColor2: '#bdbdbd', gridColor: '#e5e5e5',
    taskBkgColor: '#707070', taskBorderColor: '#575757',
    activeTaskBkgColor: '#eeeeee', activeTaskBorderColor: '#575757',
    doneTaskBkgColor: '#bbbbbb', doneTaskBorderColor: '#666666',
    critBkgColor: '#dd4422', critBorderColor: '#b1361b',
    taskTextColor: '#ffffff', taskTextDarkColor: '#333333', taskTextOutsideColor: '#333333',
    todayLineColor: '#dd4422', vertLineColor: '#dd4422',
  },
  neo,
  'neo-dark': neoDark,
  redux,
  'redux-color': { ...redux, ...coloredSections },
  'redux-dark': reduxDark,
  'redux-dark-color': { ...reduxDark, ...coloredSections, altSectionBkgColor: '#333333' },
}

export function ganttTheme(value: unknown): ThemeColors | undefined {
  if (typeof value === 'string' && Object.hasOwn(presets, value)) return presets[value]
}
