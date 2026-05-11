import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get('q')
  if (!query || query.length < 2) return NextResponse.json([])

  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
  if (!token) return NextResponse.json({ error: 'Mapbox token missing' }, { status: 500 })

  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?types=place,locality,neighborhood&limit=6&access_token=${token}`

  const res = await fetch(url)
  if (!res.ok) return NextResponse.json([])

  const data = await res.json()

  const results = (data.features ?? []).map((f: {
    id: string
    place_name: string
    center: [number, number]
    context?: Array<{ id: string; text: string }>
    text: string
  }) => {
    const context = f.context ?? []
    const country = context.find((c) => c.id.startsWith('country'))?.text ?? ''
    const region = context.find((c) => c.id.startsWith('region'))?.text ?? ''
    const stateAbbr = context.find((c) => c.id.startsWith('region'))?.text ?? ''

    return {
      id: f.id,
      place_name: f.place_name,
      city: f.text,
      country,
      state: country === 'United States' ? stateAbbr : null,
      lat: f.center[1],
      lng: f.center[0],
    }
  })

  return NextResponse.json(results)
}
