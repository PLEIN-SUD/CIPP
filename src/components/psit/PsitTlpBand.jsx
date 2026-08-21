import { Text, View } from '@react-pdf/renderer'

// Distribution marking, on every page.
//
// It cannot go in the page footer: branding's footer template wins over a report's own label, so a
// configured footer would silently drop the marking. A `fixed` band inside the page's children
// repeats on every physical page the content spills onto, whatever branding does.
//
// Colours and black background are FIRST's, not ours: a marking that looks like decoration gets
// read as decoration.

const TLP_COLOURS = {
  'TLP:CLEAR': '#FFFFFF',
  'TLP:GREEN': '#33FF00',
  'TLP:AMBER': '#FFC000',
  'TLP:AMBER+STRICT': '#FFC000',
  'TLP:RED': '#FF2B2B',
}

export const TLP_DEFAULT = 'TLP:AMBER+STRICT'

export const tlpLabel = (value) => (TLP_COLOURS[value] ? value : TLP_DEFAULT)

export const PsitTlpBand = ({ tlp, note }) => {
  const marking = tlpLabel(tlp)
  return (
    <View
      fixed
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: '#000000',
        paddingVertical: 3,
        paddingHorizontal: 6,
        marginBottom: 8,
      }}
    >
      <Text style={{ fontSize: 8, fontFamily: 'Helvetica-Bold', color: TLP_COLOURS[marking] }}>
        {marking}
      </Text>
      {note ? <Text style={{ fontSize: 7, color: '#FFFFFF' }}>{note}</Text> : null}
    </View>
  )
}
