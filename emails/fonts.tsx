import { Font } from 'react-email';

export function EmailFonts() {
  return (
    <>
      {/* Outfit */}
      <Font
        fontFamily="Outfit"
        fallbackFontFamily={['Arial', 'Helvetica', 'sans-serif']}
        webFont={{
          url: 'https://fonts.gstatic.com/s/outfit/v14/QGYvz_MVcBeNP4NJtEtqUYLknw.woff2',
          format: 'woff2',
        }}
        fontWeight={400}
        fontStyle="normal"
      />

      <Font
        fontFamily="Outfit"
        fallbackFontFamily={['Arial', 'Helvetica', 'sans-serif']}
        webFont={{
          url: 'https://fonts.gstatic.com/s/outfit/v14/QGYvz_MVcBeNP4NJuktqUYLknw.woff2',
          format: 'woff2',
        }}
        fontWeight={500}
        fontStyle="normal"
      />

      <Font
        fontFamily="Outfit"
        fallbackFontFamily={['Arial', 'Helvetica', 'sans-serif']}
        webFont={{
          url: 'https://fonts.gstatic.com/s/outfit/v14/QGYvz_MVcBeNP4NJxMtqUYLknw.woff2',
          format: 'woff2',
        }}
        fontWeight={700}
        fontStyle="normal"
      />

      {/* Bricolage Grotesque */}
      <Font
        fontFamily="Bricolage Grotesque"
        fallbackFontFamily={['Arial', 'Helvetica', 'sans-serif']}
        webFont={{
          url: 'https://fonts.gstatic.com/s/bricolagegrotesque/v7/3y9H6as8bTXq_nANBjzKo3IeZx8z6N4GJQ.woff2',
          format: 'woff2',
        }}
        fontWeight={400}
        fontStyle="normal"
      />

      <Font
        fontFamily="Bricolage Grotesque"
        fallbackFontFamily={['Arial', 'Helvetica', 'sans-serif']}
        webFont={{
          url: 'https://fonts.gstatic.com/s/bricolagegrotesque/v7/3y9H6as8bTXq_nANBjzKo3IeZx8z6N4GJQ.woff2',
          format: 'woff2',
        }}
        fontWeight={500}
        fontStyle="normal"
      />

      <Font
        fontFamily="Bricolage Grotesque"
        fallbackFontFamily={['Arial', 'Helvetica', 'sans-serif']}
        webFont={{
          url: 'https://fonts.gstatic.com/s/bricolagegrotesque/v7/3y9H6as8bTXq_nANBjzKo3IeZx8z6N4GJQ.woff2',
          format: 'woff2',
        }}
        fontWeight={700}
        fontStyle="normal"
      />
    </>
  );
}