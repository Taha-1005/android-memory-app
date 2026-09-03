import React from 'react';
import { StyleProp, Text, TextStyle } from 'react-native';

export interface EditSuggestion {
  newTitle?: string;
  newBody?: string;
  newFacts?: string[];
}

/**
 * Render the `title → / body → / facts →` lines for an LLM edit suggestion.
 * Shared by the duplicate-scan cards in Settings and the pre-save duplicate
 * panel in Add, which display the same suggestion shape with different styles.
 */
export function SuggestionLines({
  suggestion,
  style,
}: {
  suggestion: EditSuggestion;
  style?: StyleProp<TextStyle>;
}): React.JSX.Element {
  return (
    <>
      {suggestion.newTitle ? <Text style={style}>title → {suggestion.newTitle}</Text> : null}
      {suggestion.newBody ? <Text style={style}>body → {suggestion.newBody}</Text> : null}
      {suggestion.newFacts?.length ? (
        <Text style={style}>facts → {suggestion.newFacts.join('; ')}</Text>
      ) : null}
    </>
  );
}
