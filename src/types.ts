export type GameMode = 'classic' | 'elimination' | 'race';
export type RoomStatus = 'lobby' | 'playing' | 'finished';
export type GamePhase = 'question' | 'reveal' | 'voting' | 'vote_result' | 'results';
export type PlayerStatus = 'in_room' | 'left' | 'active' | 'eliminated';
export type Category = 'general' | 'videogames' | 'series_90s';
export type Difficulty = 'easy' | 'medium' | 'hard';

export interface PlayerSession {
  playerId: string;
  nickname: string;
  token: string;
}

export interface ActiveRoom {
  id: string;
  code: string;
  status: RoomStatus;
}

export interface RoomView {
  id: string;
  code: string;
  status: RoomStatus;
  mode: GameMode;
  maxRounds: number;
  hostPlayerId: string;
  playerCount: number;
}

export interface MeView {
  playerId: string;
  nickname: string;
  isHost: boolean;
  isActive: boolean;
}

export interface PlayerView {
  playerId: string;
  nickname: string;
  seat: number;
  status: PlayerStatus;
  score: number;
  correctCount: number;
  wrongCount: number;
  eliminatedRound: number | null;
  finalRank: number | null;
  isWinner: boolean;
  isHost: boolean;
  countryCode: string;
}

export interface VoteTally {
  playerId: string;
  votes: number;
}

export interface GameView {
  id: string;
  number: number;
  mode: GameMode;
  status: 'playing' | 'finished';
  phase: GamePhase;
  currentRound: number;
  maxRounds: number;
  currentPlayerId: string | null;
  revealUntil: string | null;
  winnerPlayerId: string | null;
  lastEliminatedPlayerId: string | null;
  lastVoteResult: VoteTally[] | null;
}

export interface QuestionView {
  gameQuestionId: string;
  prompt: string;
  options: string[];
  category: Category;
  difficulty: Difficulty;
  round: number;
  turnIndex: number;
  servedAt: string;
  deadlineAt: string | null;
  isMine: boolean;
}

export interface LastAnswerView {
  playerId: string;
  nickname: string;
  selectedIndex: number | null;
  correctDisplayIndex: number;
  correctText: string;
  explanation: string;
  isCorrect: boolean;
  points: number;
  skipped: boolean;
  skippedByHost: boolean;
  answeredAt: string;
}

export interface VotingCandidate {
  playerId: string;
  nickname: string;
  seat: number;
}

export interface VotingView {
  votesCast: number;
  votersTotal: number;
  myVoteTargetId: string | null;
  candidates: VotingCandidate[];
}

export interface RaceMyAnswer {
  selectedIndex: number;
  isCorrect: boolean;
  pointsDelta: number;
}

export interface RaceView {
  status: 'pending' | 'open' | 'answered' | 'expired';
  deadlineAt: string | null;
  answeredBy: string | null;
  answeredByNickname: string | null;
  timedOut: boolean;
  skippedByHost: boolean;
  timeoutPenalty: number;
  correctDisplayIndex: number | null;
  correctText: string | null;
  explanation: string | null;
  myAnswer: RaceMyAnswer | null;
}

export interface ConnectedPlayer {
  playerId: string;
  nickname: string;
  countryCode: string;
  status: 'available' | 'in_lobby' | 'in_game';
  invited: boolean;
}

export interface RoomInvite {
  id: string;
  roomId: string;
  roomCode: string;
  inviterNickname: string;
  inviterCountryCode: string;
  createdAt: string;
  expiresAt: string;
}

export interface ChatMessage {
  id: string;
  playerId: string;
  nickname: string;
  countryCode: string;
  body: string;
  createdAt: string;
}

export interface RankingEntry {
  playerId: string;
  nickname: string;
  score: number;
  correctCount: number;
  status: PlayerStatus;
  eliminatedRound: number | null;
  finalRank: number | null;
  isWinner: boolean;
  seat: number;
}

export interface ResultsView {
  winner: { playerId: string; nickname: string; score: number } | null;
  ranking: RankingEntry[];
}

export interface RoomState {
  serverTime: string;
  room: RoomView;
  me: MeView;
  players: PlayerView[];
  game: GameView | null;
  question: QuestionView | null;
  lastAnswer: LastAnswerView | null;
  voting: VotingView | null;
  race: RaceView | null;
  results: ResultsView | null;
}

export interface ResumeData {
  player: { id: string; nickname: string; countryCode?: string };
  room: {
    id: string;
    code: string;
    status: RoomStatus;
    mode: GameMode;
    maxRounds: number;
  } | null;
}

export interface RegisterData {
  playerId: string;
  nickname: string;
  countryCode?: string;
  token: string;
}
