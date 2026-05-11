import {
  Badge,
  Box,
  HStack,
  ListContent,
  ListDetail,
  ListItem,
  ListRoot,
  ListTitle,
  Text,
} from '@seed-design/react';
import type { SystemStatus } from '../api/client';

type Entry = SystemStatus['recentActivity'][number];

export default function ActivityFeed({ entries }: { entries: Entry[] }) {
  if (!entries.length) {
    return (
      <Box
        padding="24px"
        borderRadius="r3"
        borderWidth={1}
        borderColor="stroke.neutralMuted"
        background="bg.layerFill"
        style={{ textAlign: 'center' }}
      >
        <Text textStyle="t6Regular" color="fg.neutralMuted">
          No recent activity in the queue log.
        </Text>
      </Box>
    );
  }
  return (
    <ListRoot>
      {entries.map((entry, idx) => (
        <ListItem key={`${entry.id ?? idx}-${entry.createdAtMs ?? idx}`}>
          <ListContent>
            <ListTitle>
              <HStack gap="8px" wrap="wrap" style={{ alignItems: 'baseline' }}>
                <Badge tone="neutral" variant="weak" size="medium">
                  {entry.kind ?? 'msg'}
                </Badge>
                <Text textStyle="t6Medium">{entry.from ?? '?'}</Text>
                <Text textStyle="t6Regular" color="fg.neutralSubtle">
                  →
                </Text>
                <Text textStyle="t6Medium">{entry.to ?? '?'}</Text>
              </HStack>
            </ListTitle>
            <ListDetail>
              <Text textStyle="t7Regular" color="fg.neutralMuted">
                {entry.body}
              </Text>
              <Text
                as="p"
                textStyle="t8Bold"
                color="fg.neutralSubtle"
                style={{ marginTop: 4 }}
              >
                {entry.createdAt ?? '—'}
              </Text>
            </ListDetail>
          </ListContent>
        </ListItem>
      ))}
    </ListRoot>
  );
}
