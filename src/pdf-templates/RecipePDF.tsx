import {
  Document, Page, Text, View, StyleSheet, Font,
} from '@react-pdf/renderer';
import type { Recipe, Ingredient } from '@/lib/types';

const styles = StyleSheet.create({
  page: { fontFamily: 'Helvetica', padding: 50, fontSize: 11, color: '#1c1917' },
  header: { borderBottom: '2pt solid #d97706', paddingBottom: 12, marginBottom: 16 },
  title: { fontSize: 22, fontFamily: 'Helvetica-Bold', color: '#1c1917', marginBottom: 4 },
  description: { fontSize: 10, color: '#57534e', lineHeight: 1.5 },
  metaRow: { flexDirection: 'row', gap: 16, marginTop: 8, marginBottom: 4 },
  metaItem: { fontSize: 9, color: '#78716c' },
  metaLabel: { fontFamily: 'Helvetica-Bold', color: '#44403c' },
  credit: { backgroundColor: '#fef3c7', padding: 8, borderRadius: 4, marginBottom: 16 },
  creditText: { fontSize: 9, color: '#92400e' },
  creditBook: { fontFamily: 'Helvetica-Bold' },
  sectionTitle: { fontFamily: 'Helvetica-Bold', fontSize: 13, color: '#1c1917', marginBottom: 8, marginTop: 16 },
  twoCol: { flexDirection: 'row', gap: 24 },
  col: { flex: 1 },
  ingRow: { flexDirection: 'row', gap: 6, marginBottom: 5, alignItems: 'flex-start' },
  ingBullet: { width: 5, height: 5, borderRadius: 3, backgroundColor: '#f59e0b', marginTop: 3 },
  ingText: { fontSize: 10, color: '#44403c', flex: 1, lineHeight: 1.4 },
  stepRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  stepNum: { width: 18, height: 18, borderRadius: 9, backgroundColor: '#fef3c7', alignItems: 'center', justifyContent: 'center' },
  stepNumText: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#d97706' },
  stepText: { fontSize: 10, color: '#44403c', flex: 1, lineHeight: 1.5 },
  notes: { backgroundColor: '#fffbeb', borderLeft: '3pt solid #f59e0b', padding: 10, marginTop: 16 },
  notesTitle: { fontFamily: 'Helvetica-Bold', fontSize: 10, color: '#92400e', marginBottom: 4 },
  notesText: { fontSize: 9, color: '#44403c', lineHeight: 1.5 },
  footer: { position: 'absolute', bottom: 30, left: 50, right: 50, borderTop: '1pt solid #e7e5e4', paddingTop: 6 },
  footerText: { fontSize: 8, color: '#a8a29e', textAlign: 'center' },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 12 },
  tag: { backgroundColor: '#f5f5f4', borderRadius: 3, paddingHorizontal: 6, paddingVertical: 2 },
  tagText: { fontSize: 8, color: '#78716c' },
});

interface Props {
  recipe: Recipe & { book_year?: number };
  ingredients: Ingredient[];
}

export default function RecipePDF({ recipe, ingredients }: Props) {
  const instructions: string[] = recipe.instructions ? JSON.parse(recipe.instructions) : [];
  const tags: string[] = recipe.tags ? JSON.parse(recipe.tags) : [];

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>{recipe.title}</Text>
          {recipe.description && (
            <Text style={styles.description}>{recipe.description}</Text>
          )}
          <View style={styles.metaRow}>
            {recipe.prep_time && (
              <Text style={styles.metaItem}><Text style={styles.metaLabel}>Prep: </Text>{recipe.prep_time}</Text>
            )}
            {recipe.cook_time && (
              <Text style={styles.metaItem}><Text style={styles.metaLabel}>Cook: </Text>{recipe.cook_time}</Text>
            )}
            {recipe.total_time && (
              <Text style={styles.metaItem}><Text style={styles.metaLabel}>Total: </Text>{recipe.total_time}</Text>
            )}
            {recipe.servings && (
              <Text style={styles.metaItem}><Text style={styles.metaLabel}>Serves: </Text>{recipe.servings}</Text>
            )}
          </View>
        </View>

        {/* Book credit */}
        <View style={styles.credit}>
          <Text style={styles.creditText}>
            From:{' '}
            <Text style={styles.creditBook}>{recipe.book_title}</Text>
            {' '}by {recipe.book_author}
            {recipe.book_year ? ` (${recipe.book_year})` : ''}
          </Text>
        </View>

        {/* Ingredients + Instructions */}
        <View style={styles.twoCol}>
          <View style={styles.col}>
            <Text style={styles.sectionTitle}>Ingredients</Text>
            {ingredients.length > 0 ? (
              ingredients.map((ing, i) => (
                <View key={i} style={styles.ingRow}>
                  <View style={styles.ingBullet} />
                  <Text style={styles.ingText}>
                    {[ing.quantity, ing.unit, ing.name, ing.preparation].filter(Boolean).join(' ')}
                    {ing.is_optional ? ' (optional)' : ''}
                  </Text>
                </View>
              ))
            ) : (
              JSON.parse(recipe.ingredients_raw || '[]').map((ing: string, i: number) => (
                <View key={i} style={styles.ingRow}>
                  <View style={styles.ingBullet} />
                  <Text style={styles.ingText}>{ing}</Text>
                </View>
              ))
            )}
          </View>

          <View style={[styles.col, { flex: 1.6 }]}>
            <Text style={styles.sectionTitle}>Instructions</Text>
            {instructions.map((step, i) => (
              <View key={i} style={styles.stepRow}>
                <View style={styles.stepNum}>
                  <Text style={styles.stepNumText}>{i + 1}</Text>
                </View>
                <Text style={styles.stepText}>{step}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Notes */}
        {recipe.notes && (
          <View style={styles.notes}>
            <Text style={styles.notesTitle}>Notes</Text>
            <Text style={styles.notesText}>{recipe.notes}</Text>
          </View>
        )}

        {/* Tags */}
        {tags.length > 0 && (
          <View style={styles.tags}>
            {tags.map(tag => (
              <View key={tag} style={styles.tag}>
                <Text style={styles.tagText}>{tag}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Footer */}
        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>
            {recipe.title} &bull; From: {recipe.book_title} by {recipe.book_author} &bull; Recipe Notebook
          </Text>
        </View>
      </Page>
    </Document>
  );
}
