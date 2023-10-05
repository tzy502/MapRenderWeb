export interface MapleLife
{
	id: number
	lifes: Array<MapLife>
	width: number
	height: number
}


export interface MapLife
{
    id: number
	x: number
	y: number
	z: number
	flipX: boolean
	resource: FrameAnimate
	lifeName: string
	lifeFunc: string
	width: number
	height: number
	type: string
}


export interface Sprite
{
	width: number
	height: number
	originX: number
	originY: number
	z: number
	resourceUrl: string
}

export interface Frame extends Sprite
{
	delay: number
	a0: number
	a1: number
}

export interface FrameAnimate
{
	frames: Array<Frame>
}

export async function loadMapInfo(mapID: number, publicResourceBaseUrl?: string | URL | undefined) : Promise<MapleLife> {
    // const url = new URL(`Map/Map/Map${Math.floor(mapID/100000000)}/${mapID}.json`, publicResourceBaseUrl);
	console.log("loadMapInfo")
    // const resp = await fetch("https://wiki.biligame.com/maplestory/100000000/mapinfo?action=raw");
	const resp = await fetch("http://localhost:9334/mob");
    const respBody = await resp.json();
    return respBody as MapleLife;
}
