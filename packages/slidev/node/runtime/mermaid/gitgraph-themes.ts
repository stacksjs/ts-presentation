import type { GitLabelAppearance } from 'ts-charts/diagrams'

interface GitGraphPreset {
  branches: readonly string[]
  highlights: readonly string[]
  branchText: readonly string[]
  background: string
  title: string
  commit: GitLabelAppearance
  tag: GitLabelAppearance
}

const solidText = (color: string) => Array<string>(8).fill(color)

// Normalized CSS colors from Mermaid 12.3.0. See licenses/Mermaid-MIT.txt.
const presets: Readonly<Record<string, GitGraphPreset>> = {
  base: {
    branches: ['#ffcb5e', '#cb5eff', '#77a3ff', '#ff7a5e', '#ff5e92', '#ff5ee3', '#92ff5e', '#5effcb'],
    highlights: ['#0034a2', '#34a200', '#885c00', '#0085a2', '#00a26d', '#00a21d', '#6d00a2', '#a20034'],
    branchText: solidText('#333333'),
    background: '#f4f4f4', title: '#090600',
    commit: { color: '#0b2200', background: '#f4ddff', fontSize: 10 },
    tag: { color: '#333333', background: '#fff4dd', border: '#eedebb', fontSize: 10 },
  },
  dark: {
    branches: ['#797d7d', '#a12273', '#6a8993', '#9b5c35', '#cc1212', '#65007b', '#cc7801', '#31a50e'],
    highlights: ['#868282', '#5edd8c', '#95766c', '#64a3ca', '#34eded', '#9aff84', '#3387fe', '#ce5af1'],
    branchText: ['#2c2c2c', '#d3d3d3', '#d3d3d3', '#2c2c2c', '#d3d3d3', '#d3d3d3', '#d3d3d3', '#d3d3d3'],
    background: '#333333', title: '#f9fffe',
    commit: { color: '#b8b6b6', background: '#474949', fontSize: 10 },
    tag: { color: '#e0dfdf', background: '#1f2020', border: '#cccccc', fontSize: 10 },
  },
  default: {
    branches: ['#0000ec', '#dede00', '#9dec00', '#0076ec', '#00ecec', '#00ec76', '#ec00ec', '#ec0000'],
    highlights: ['#131300', '#0000a1', '#310093', '#934900', '#930000', '#930049', '#009300', '#009393'],
    branchText: ['#ffffff', '#000000', '#000000', '#ffffff', '#000000', '#000000', '#000000', '#000000'],
    background: '#ffffff', title: '#333333',
    commit: { color: '#000021', background: '#ffffde', fontSize: 10 },
    tag: { color: '#131300', background: '#ececff', border: '#c7c7f1', fontSize: 10 },
  },
  forest: {
    branches: ['#9bc834', '#7aff32', '#b0d45b', '#c8ab34', '#c86134', '#c83452', '#34c861', '#349bc8'],
    highlights: ['#6437cb', '#8500cd', '#4f2ba4', '#3754cb', '#379ecb', '#37cbad', '#cb379e', '#cb6437'],
    branchText: ['#ffffff', '#000000', '#000000', '#ffffff', '#000000', '#000000', '#000000', '#000000'],
    background: '#ffffff', title: '#333333',
    commit: { color: '#32004d', background: '#cdffb2', fontSize: 10 },
    tag: { color: '#321b67', background: '#cde498', border: '#abb594', fontSize: 10 },
  },
  neutral: {
    branches: ['#b4b4b4', '#555555', '#bbbbbb', '#777777', '#999999', '#dddddd', '#ffffff', '#dddddd'],
    highlights: ['#4b4b4b', '#aaaaaa', '#444444', '#888888', '#666666', '#222222', '#000000', '#222222'],
    branchText: ['#333333', '#ffffff', '#333333', '#ffffff', '#333333', '#333333', '#333333', '#333333'],
    background: '#ffffff', title: '#333333',
    commit: { color: '#030303', background: '#fcfcfc', fontSize: 10 },
    tag: { color: '#111111', background: '#eeeeee', border: '#d5d5d5', fontSize: 10 },
  },
  neo: {
    branches: ['#7373f8', '#9b9bbf', '#f9f986', '#73b5f8', '#73f8f8', '#73f8b5', '#f873f8', '#f87373'],
    highlights: ['#8c8c07', '#646440', '#060679', '#8c4a07', '#8c0707', '#8c074a', '#078c07', '#078c8c'],
    branchText: solidText('#333333'),
    background: '#ffffff', title: '#000000',
    commit: { color: '#333333', background: '#cccccc', fontSize: 10 },
    tag: { color: '#333333', background: '#cccccc', border: '#b3b3b3', fontSize: 10 },
  },
  'neo-dark': {
    branches: ['#8b0000', '#b72682', '#78959e', '#ae683b', '#e31515', '#a300c8', '#fea01c', '#38bd10'],
    highlights: ['#75ffff', '#48d97d', '#876a61', '#5197c4', '#1ceaea', '#5cff38', '#015fe3', '#c742ef'],
    branchText: solidText('#e0dfdf'),
    background: '#333333', title: '#dfe0e0',
    commit: { color: '#b8b6b6', background: '#474949', fontSize: 10 },
    tag: { color: '#e0dfdf', background: '#1f2020', border: '#cccccc', fontSize: 10 },
  },
  redux: {
    branches: ['#7373f8', '#9b9bbf', '#f9f986', '#73b5f8', '#73f8f8', '#73f8b5', '#f873f8', '#f87373'],
    highlights: ['#8c8c07', '#646440', '#060679', '#8c4a07', '#8c0707', '#8c074a', '#078c07', '#078c8c'],
    branchText: solidText('#28253d'),
    background: '#ffffff', title: '#000000',
    commit: { color: '#333333', background: '#cccccc', fontSize: 10 },
    tag: { color: '#28253d', background: '#cccccc', border: '#181818', fontSize: 10 },
  },
  'redux-dark': {
    branches: ['#000000', '#080909', '#000000', '#000000', '#000000', '#000000', '#000000', '#000000'],
    highlights: ['#ffffff', '#f7f6f6', '#ffffff', '#ffffff', '#ffffff', '#ffffff', '#ffffff', '#ffffff'],
    branchText: solidText('#e0dfdf'),
    background: '#333333', title: '#dfe0e0',
    commit: { color: '#b8b6b6', background: '#474949', fontSize: 10 },
    tag: { color: '#e0dfdf', background: '#1f2020', border: '#cccccc', fontSize: 10 },
  },
}

export function gitGraphPreset(value: unknown): GitGraphPreset | undefined {
  if (typeof value !== 'string') return
  // Both Redux variants share GitGraph variables in the pinned reference.
  const key = value === 'redux-color' ? 'redux' : value === 'redux-dark-color' ? 'redux-dark' : value
  if (Object.hasOwn(presets, key)) return presets[key]
}
