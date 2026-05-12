import { useMemo } from 'react';
import {
  livenessStreamUrl,
  type ContractList,
  type HeartbeatList,
  type TimeoutList,
} from '../api/client';
import { useWebSocket } from './use-web-socket';

export interface LivenessStreamFrame {
  type: 'liveness';
  heartbeats: HeartbeatList;
  timeouts: TimeoutList;
  contracts: ContractList;
  ts: number;
}

export function useLivenessStream(): LivenessStreamFrame | null {
  const url = useMemo(() => livenessStreamUrl(), []);
  const { data } = useWebSocket<LivenessStreamFrame>(url);
  return data;
}
