import type { AgentRoom } from '../types';
import type { EngineCharacter, OfficeLayout } from './types';

let charactersState: EngineCharacter[] = [];
let layoutState: OfficeLayout | null = null;
let roomsState: AgentRoom[] = [];

export function getCharacters(): EngineCharacter[] {
  return charactersState;
}

export function setCharacters(next: EngineCharacter[]): void {
  charactersState = next;
}

export function getLayout(): OfficeLayout | null {
  return layoutState;
}

export function setLayout(next: OfficeLayout | null): void {
  layoutState = next;
}

export function getRooms(): AgentRoom[] {
  return roomsState;
}

export function setRooms(next: AgentRoom[]): void {
  roomsState = next;
}

export function resetWorkshopState(): void {
  charactersState = [];
  layoutState = null;
  roomsState = [];
}
