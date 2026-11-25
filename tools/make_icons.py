import math, sys
def svg(scale=1.0, rounded=False, bg=True):
    # scale: content scale around centre (for maskable safe zone)
    C=256
    def pt(r, deg):  # deg clockwise from 12 o'clock
        a=math.radians(deg-90); return C+r*math.cos(a), C+r*math.sin(a)
    R=176; W=30; a0=-8; a1=128
    x0,y0=pt(R,a0); x1,y1=pt(R,a1)
    large=1 if (a1-a0)>180 else 0
    # arrowhead at a1: tangent direction clockwise
    tip=pt(R, a1+16)
    bL=pt(R-34, a1); bR=pt(R+34, a1)
    ticks=''.join(f'<line x1="{pt(122,d)[0]:.1f}" y1="{pt(122,d)[1]:.1f}" x2="{pt(136 if d%90 else 132,d)[0]:.1f}" y2="{pt(136 if d%90 else 132,d)[1]:.1f}" stroke="#0e6b52" stroke-width="{9 if d%90==0 else 6}" stroke-linecap="round" opacity="{1 if d%90==0 else .55}"/>' for d in range(0,360,30))
    hm=pt(92, 120)  # long hand toward 4
    hh=pt(62, 0)    # short hand at 12
    body=f'''
  <g transform="translate({C} {C}) scale({scale}) translate({-C-14} {-C-4})">
    <path d="M{x0:.1f} {y0:.1f} A{R} {R} 0 {large} 1 {x1:.1f} {y1:.1f}" fill="none" stroke="#f2b632" stroke-width="{W}" stroke-linecap="round"/>
    <path d="M{bL[0]:.1f} {bL[1]:.1f} L{tip[0]:.1f} {tip[1]:.1f} L{bR[0]:.1f} {bR[1]:.1f} Z" fill="#f2b632" stroke="#f2b632" stroke-width="6" stroke-linejoin="round"/>
    <circle cx="{C}" cy="{C}" r="146" fill="#fbf7ec"/>
    {ticks}
    <line x1="{C}" y1="{C}" x2="{hh[0]:.1f}" y2="{hh[1]:.1f}" stroke="#0f241d" stroke-width="20" stroke-linecap="round"/>
    <line x1="{C}" y1="{C}" x2="{hm[0]:.1f}" y2="{hm[1]:.1f}" stroke="#0e6b52" stroke-width="15" stroke-linecap="round"/>
    <circle cx="{C}" cy="{C}" r="17" fill="#0f241d"/>
    <circle cx="{C}" cy="{C}" r="7" fill="#f2b632"/>
  </g>'''
    r = 112 if rounded else 0
    back = f'<rect width="512" height="512" rx="{r}" fill="url(#g)"/>' if bg else ''
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#13805f"/><stop offset="1" stop-color="#0a5341"/></linearGradient></defs>
  {back}{body}
</svg>'''
open('icon.svg','w').write(svg(1.0, rounded=False))
open('icon-rounded.svg','w').write(svg(1.0, rounded=True))
open('maskable.svg','w').write(svg(0.78, rounded=False))
