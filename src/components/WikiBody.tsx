import React from 'react';
import { StyleSheet, Text, TextStyle } from 'react-native';
import { slugify } from '../domain/slugify';

interface Props {
  text: string;
  onOpen: (slug: string, title: string) => void;
  style?: TextStyle;
}

export function WikiBody({ text, onOpen, style }: Props): React.JSX.Element {
  const parts: Array<{ t: 'text' | 'link'; v: string }> = [];
  const re = /\[\[([^\]]+)\]\]/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push({ t: 'text', v: text.slice(last, m.index) });
    parts.push({ t: 'link', v: m[1] });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ t: 'text', v: text.slice(last) });
  return (
    <Text style={[styles.body, style]}>
      {parts.map((p, i) =>
        p.t === 'link' ? (
          <Text
            key={i}
            onPress={() => onOpen(slugify(p.v), p.v)}
            style={styles.link}
            accessibilityRole="link"
            accessibilityLabel={`Open page ${p.v}`}
          >
            {p.v}
          </Text>
        ) : (
          <Text key={i}>{p.v}</Text>
        ),
      )}
    </Text>
  );
}

const styles = StyleSheet.create({
  body: {
    fontSize: 16,
    lineHeight: 24,
    color: '#1f2937',
  },
  link: {
    color: '#2563eb',
    textDecorationLine: 'underline',
  },
});
