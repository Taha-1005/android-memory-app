import React, { useMemo } from 'react';
import { StyleSheet, Text, TextStyle } from 'react-native';
import { slugify } from '../domain/slugify';
import { useTheme } from '../theme/ThemeContext';

interface Props {
  text: string;
  onOpen: (slug: string, title: string) => void;
  style?: TextStyle;
}

export function WikiBody({ text, onOpen, style }: Props): React.JSX.Element {
  const { colors } = useTheme();
  const parts = useMemo<Array<{ t: 'text' | 'link'; v: string }>>(() => {
    const out: Array<{ t: 'text' | 'link'; v: string }> = [];
    const re = /\[\[([^\]]+)\]\]/g;
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      if (m.index > last) out.push({ t: 'text', v: text.slice(last, m.index) });
      out.push({ t: 'link', v: m[1] });
      last = m.index + m[0].length;
    }
    if (last < text.length) out.push({ t: 'text', v: text.slice(last) });
    return out;
  }, [text]);
  return (
    <Text style={[styles.body, { color: colors.text }, style]}>
      {parts.map((p, i) =>
        p.t === 'link' ? (
          <Text
            key={i}
            onPress={() => onOpen(slugify(p.v), p.v)}
            style={[styles.link, { color: colors.link }]}
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
  },
  link: {
    textDecorationLine: 'underline',
  },
});
