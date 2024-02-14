import * as WZ from './wz_loader'
import * as PIXI from 'pixi.js'
import { Viewport } from 'pixi-viewport'
import { MovedEvent, ZoomedEvent } from 'pixi-viewport/dist/types'

//------------------------------
// custom PIXI containers
interface MaplestoryMapBackRenderResource {
    get rect(): PIXI.Rectangle
    update(deltaTime: number): void
    clone(): PIXI.DisplayObject
}

class MaplestoryAnimatedSprite extends PIXI.AnimatedSprite implements MaplestoryMapBackRenderResource {
    constructor(textures: PIXI.Texture[] | PIXI.FrameObject[], autoUpdate?: boolean) {
        super(textures, autoUpdate);
        this._rawTextures = textures;
        this._rect = new PIXI.Rectangle();
    }

    private _rawFrames?: Array<WZ.Frame>
    private readonly _rawTextures: PIXI.Texture[] | PIXI.FrameObject[]
    private _rect: PIXI.Rectangle

    update(deltaTime: number): void {
        super.update(deltaTime);

        if (this.rawFrames && this.currentFrame < this.rawFrames.length) {
            const rawFrame = this.rawFrames[this.currentFrame];
            this.pivot.set(rawFrame.originX, rawFrame.originY);

            const currentTime = <number>this["_currentTime"] % 1;
            this.alpha = (rawFrame.a0 * (1 - currentTime) + rawFrame.a1 * currentTime) / 255.0;
        }
    }

    get rect(): PIXI.Rectangle {
        return this._rect;
    }

    get rawFrames(): Array<WZ.Frame> | undefined {
        return this._rawFrames;
    }

    set rawFrames(value: Array<WZ.Frame> | undefined) {
        this._rawFrames = value;
        this._rect = this.calculateRect();
    }

    clone(): MaplestoryAnimatedSprite {
        const clonedObj = new MaplestoryAnimatedSprite(this._rawTextures, this.autoUpdate);
        clonedObj.x = this.x;
        clonedObj.y = this.y;
        clonedObj.scale = this.scale;
        clonedObj.pivot = this.pivot;
        clonedObj.alpha = this.alpha;
        clonedObj.loop = this.loop;
        clonedObj.rawFrames = this.rawFrames;
        clonedObj.currentFrame = this.currentFrame;
        clonedObj["_currentTime"] = this["_currentTime"];

        this.playing ? clonedObj.play() : clonedObj.stop();
        // force updating once to sync all properties.
        clonedObj.update(0);
        return clonedObj;
    }

    private calculateRect(): PIXI.Rectangle {
        if (!this.rawFrames) {
            return new PIXI.Rectangle();
        }

        let left = Number.MAX_SAFE_INTEGER,
            top = Number.MAX_SAFE_INTEGER,
            right = Number.MIN_SAFE_INTEGER,
            bottom = Number.MIN_SAFE_INTEGER;

        this.rawFrames.forEach(frame => {
            left = Math.min(left, -frame.originX);
            top = Math.min(top, -frame.originY);
            right = Math.max(right, -frame.originX + frame.width);
            bottom = Math.max(bottom, -frame.originY + frame.height);
        });

        // handle flipX
        if (this.scale.x >= 0) {
            return new PIXI.Rectangle(left * this.scale.x, top, (right - left) * this.scale.x, bottom - top);
        } else {
            return new PIXI.Rectangle(right * this.scale.x, top, (left - right) * this.scale.x, bottom - top);
        }
    }
}

class MaplestorySprite extends PIXI.Sprite implements MaplestoryMapBackRenderResource {
    constructor(texture?: PIXI.Texture) {
        super(texture);
    }

    get rect(): PIXI.Rectangle {
        if (!this.texture) return new PIXI.Rectangle();
        let rect = new PIXI.Rectangle(-this.pivot.x, -this.pivot.y, this.texture.width, this.texture.height);
        if (this.scale.x >= 0) {
            return new PIXI.Rectangle(rect.x * this.scale.x, rect.y, this.texture.width * this.scale.x, this.texture.height);
        } else {
            return new PIXI.Rectangle(rect.right * this.scale.x, rect.y, this.texture.width * -this.scale.x, this.texture.height);
        }
    }

    update(deltaTime: number): void {
        // non-op function
    }

    clone(): MaplestorySprite {
        const clonedObj = new MaplestorySprite(this.texture);
        clonedObj.x = this.x;
        clonedObj.y = this.y;
        clonedObj.scale = this.scale;
        clonedObj.pivot = this.pivot;
        clonedObj.alpha = this.alpha;
        return clonedObj;
    }
}

class TileMode {
    constructor(tileX: boolean, tileY: boolean, autoScrollX: boolean, autoScrollY: boolean) {
        this.tileX = tileX;
        this.tileY = tileY;
        this.autoScrollX = autoScrollX;
        this.autoScrollY = autoScrollY;
    }

    tileX: boolean
    tileY: boolean
    autoScrollX: boolean
    autoScrollY: boolean

    static fromBackType(backType: number): TileMode {
        switch (backType) {
            case 0: return new TileMode(false, false, false, false);
            case 1: return new TileMode(true, false, false, false);
            case 2: return new TileMode(false, true, false, false);
            case 3: return new TileMode(true, true, false, false);
            case 4: return new TileMode(true, false, true, false);
            case 5: return new TileMode(false, true, false, true);
            case 6: return new TileMode(true, true, true, false);
            case 7: return new TileMode(true, true, false, true);
            default: return new TileMode(false, false, false, false);
        }
    }
}

class MaplestoryTilingSprite<T extends PIXI.DisplayObject & MaplestoryMapBackRenderResource> extends PIXI.Container {
    constructor(viewport: Viewport, mapBack: WZ.MapBack, renderObject: T) {
        super();
        this._viewport = viewport;
        this._mapBack = mapBack;
        this._templateRenderObject = renderObject;
        this._tileMode = TileMode.fromBackType(this._mapBack.type);

        this._positionOffset = new PIXI.Point();
        this._autoUpdate = false;
        this._isConnectedToTicker = false;

        this.attachViewportEvents();
        // TODO: detach events when this is removed from stage
    }

    private readonly _viewport: Viewport
    private readonly _mapBack: WZ.MapBack
    private readonly _templateRenderObject: T
    private readonly _tileMode: TileMode

    private _positionOffset: PIXI.Point
    private _autoUpdate: boolean;
    private _isConnectedToTicker: boolean;

    update(deltaTime: number): void {
        const screenCenter = this._viewport.center;
        const screenRect = new PIXI.Rectangle(
            screenCenter.x - this._viewport.screenWidthInWorldPixels / 2,
            screenCenter.y - this._viewport.screenHeightInWorldPixels / 2,
            this._viewport.screenWidthInWorldPixels,
            this._viewport.screenHeightInWorldPixels
        );
        const resourceRect = this._templateRenderObject.rect
        const cx = this._mapBack.cx || resourceRect.width;
        const cy = this._mapBack.cy || resourceRect.height;
        const elapsedMs = deltaTime / 60.0 * 1000;

        // calculate position
        if (this._tileMode.autoScrollX) {
            this._positionOffset.x += this._mapBack.rx * 5 * elapsedMs / 1000.0;
            this._positionOffset.x %= cx;
        } else {
            // parallax scroll by following camera center
            // rx = -100: fixed in map
            // rx = 0: sync with camera
            // rx = 100: faster than camera
            this._positionOffset.x = (screenCenter.x - 0) * (this._mapBack.rx + 100) / 100.0;
        }

        if (this._tileMode.autoScrollY) {
            this._positionOffset.y += this._mapBack.ry * 5 * elapsedMs / 1000.0;
            this._positionOffset.y %= cy;
        } else {
            this._positionOffset.y = (screenCenter.y - 0) * (this._mapBack.ry + 100) / 100.0;
        }

        let basePos = new PIXI.Point(this._mapBack.x + this._positionOffset.x, this._mapBack.y + this._positionOffset.y);

        // calculate tiling size
        let tileCountX = 1;
        let tileCountY = 1;
        if (this._tileMode.tileX && cx > 0) {
            let tileStartRight = (basePos.x + resourceRect.right - screenRect.left) % cx;
            if (tileStartRight <= 0)
                tileStartRight += cx;
            tileStartRight += screenRect.left;

            let tileStartLeft = tileStartRight - resourceRect.width;
            if (tileStartLeft >= screenRect.right) {
                tileCountX = 0;
            } else {
                tileCountX = Math.ceil((screenRect.right - tileStartLeft) / cx);
                basePos.x = tileStartLeft - resourceRect.x;
            }
        }

        if (this._tileMode.tileY && cy > 0) {
            let tileStartBottom = (basePos.y + resourceRect.bottom - screenRect.top) % cy;
            if (tileStartBottom <= 0)
                tileStartBottom += cy;
            tileStartBottom += screenRect.top;

            let tileStartTop = tileStartBottom - resourceRect.height;
            if (tileStartTop >= screenRect.bottom) {
                tileCountY = 0;
            } else {
                tileCountY = Math.ceil((screenRect.bottom - tileStartTop) / cy);
                basePos.y = tileStartTop - resourceRect.y;
            }
        }

        // ensure children count and update position
        let lastChildIndex = 0;
        for (let j = 0; j < tileCountY; j++) {
            for (let i = 0; i < tileCountX; i++) {
                if (this.children.length <= lastChildIndex) {
                    this.addChild(this._templateRenderObject.clone());
                }
                const cloneObj = this.children[lastChildIndex];
                cloneObj.x = basePos.x + i * cx;
                cloneObj.y = basePos.y + j * cy;
                lastChildIndex++;
            }
        }
        while (this.children.length > lastChildIndex) {
            this.removeChildAt(lastChildIndex);
        }

        // update all children
        this._templateRenderObject.update(deltaTime);
        this.children.forEach(v => {
            (<object>v as MaplestoryMapBackRenderResource).update(deltaTime);
        });
    }

    get autoUpdate(): boolean {
        return this._autoUpdate;
    }

    set autoUpdate(value: boolean) {
        if (value !== this._autoUpdate) {
            if (!value && this._isConnectedToTicker) {
                PIXI.Ticker.shared.remove(this.update, this);
                this._isConnectedToTicker = false;
            } else if (value && !this._isConnectedToTicker) {
                PIXI.Ticker.shared.add(this.update, this);
                this._isConnectedToTicker = true;
            }
            this._autoUpdate = value;
        }
    }

    private attachViewportEvents() {
        this._viewport.on("moved", this.onViewportMoved, this)
        this._viewport.on("zoomed", this.onViewportZoomed, this)
    }

    private onViewportMoved(e: MovedEvent) {
        this.update(0);
    }

    private onViewportZoomed(e: ZoomedEvent) {
        this.update(0);
    }
}

//------------------------------

const app = new PIXI.Application({
    backgroundColor: 0x000000,
    // resizeTo: window,
    width: 1150,  // 设置宽度为800像素
    height: 768,  // 设置高度为600像素
});
// document.body.appendChild(app.view as HTMLCanvasElement)
const mapDiv = document.getElementById("map");
if (mapDiv) {
    mapDiv.appendChild(app.view as HTMLCanvasElement);
}

// create viewport
const viewport = new Viewport({
    screenWidth: 1150,
    screenHeight: 768,
    worldWidth: null,
    worldHeight: null,

    events: app.renderer.events // the interaction module is important for wheel to work properly when renderer.view is placed or scaled
})

// add the viewport to the stage
app.stage.addChild(viewport)
app.renderer.on("resize", () => {
    viewport.resize(app.renderer.width, app.renderer.height);
});

// activate plugins
viewport
    .drag()
    // .pinch()
    // .wheel()
    .decelerate();


function compositeZIndex(z0: number, z1?: number, z2?: number): number {
    const scale = 1 << 10; // 1024
    const normalize = (v?: number) => {
        // -512 <= v <= 511
        v = Math.round(v || 0) + scale / 2;
        // 0 <= v <= 1023
        v = Math.max(0, Math.min(v, scale - 1));
        return v;
    };
    return normalize(z0) * scale * scale
        + normalize(z1) * scale
        + normalize(z2);
}

const log = console.log.bind(console)

/**
 * render functions
 */


function getCurrentMapPosition() {
    // const screenPosition = new PIXI.Point(app.renderer.width / 2, app.renderer.height / 2);
    // const worldPosition = viewport.toWorld(screenPosition);
    // console.log('Current Map Position:', worldPosition.x, worldPosition.y);
    console.log('world height width: ', viewport.worldHeight, viewport.worldWidth)
    console.log('viewport x y: ', viewport.x, viewport.y)
    console.log('viewort left top: ', viewport.left, viewport.top)
}

// console 中 window.getPosition()
(window as any).getPosition = getCurrentMapPosition

getCurrentMapPosition()

function viewportSetup(mapInfo: WZ.MapInfo): void {
    // 设置 camera 
    viewport.left = -50
    viewport.top = -50
    let totalX = mapInfo.maxX - mapInfo.minX
    let totalY = mapInfo.maxY - mapInfo.minY
    let offset = 100
    let left = Math.min(mapInfo.minX, -575)
    let right = 1150
    let top = Math.min(mapInfo.minY, -384)
    let bottom = 768
    viewport.pause = true
    if (totalX < 1150) {
        viewport.x = 575;
    } else {
        left = mapInfo.minX - offset
        right = mapInfo.maxX + offset
        viewport.pause = false
        viewport.left = mapInfo.minX
    }
    if (totalY < 768) {
        viewport.y = 384
    } else {
        top = mapInfo.minY - offset
        bottom = mapInfo.maxY + offset
        viewport.pause = false
        viewport.top = mapInfo.minY
    }
    // 拖动结束后检测边界
    viewport.on('drag-end', () => {
        viewport.clamp({
            left: left,
            top: top,
            right: right,
            bottom: bottom,
        });
    })
}


function promiseWithIndex<T>(promiseArray: Promise<T>[]): Promise<{ texture: T, index: number }[]> {
    /**
     * 由于网络不保证顺序性
     * 根据 element 在 array 的顺序
     * 返回结果 {texture: texture, index:index}
     */

    return Promise.all(
        promiseArray.map((promiseObj, index) =>
            promiseObj.then(texture => ({ texture, index }))
        )
    )
}

function renderFrames(frameAni: WZ.FrameAnimate, callBack: (frames: Array<PIXI.FrameObject>) => void) {
    const promiseList = new Array<Promise<PIXI.Texture<PIXI.Resource>>>();
    const frameList = new Array<WZ.Frame>()
    for (let k = 0; k < frameAni.frames.length; k++) {
        const frame = frameAni.frames[k];
        const spriteImageUrl = new URL(frame.resourceUrl, baseUrl).toString();
        const texture = PIXI.Assets.load<PIXI.Texture>(spriteImageUrl);
        promiseList.push(texture)
        frameList.push(frame)
    }

    promiseWithIndex(promiseList)
        .then(results => {
            const frames = new Array<PIXI.FrameObject>();
            results.forEach(({ texture, index }) => {
                // todo: may be error
                // js feature
                // a = []
                // a[2] = 1
                // ==> [empty X 2, 1]
                frames[index] = { texture: texture, time: frameList[index].delay }
            })
            return frames;
        })
        .then((frames) => {
            callBack(frames)
        })
}

function renderMapBacks(mapBacks: Array<WZ.MapBack>): void {
    if (!mapBacks) {
        return
    }

    const backLayer = viewport.addChild(new PIXI.Container());
    backLayer.sortableChildren = true;
    backLayer.zIndex = 0;
    const frontLayer = viewport.addChild(new PIXI.Container());
    frontLayer.sortableChildren = true;
    frontLayer.zIndex = 10;


    for (let i = 0; i < mapBacks.length; i++) {
        const mapBack = mapBacks[i];
        const rootLayer = mapBack.front ? frontLayer : backLayer;
        if (mapBack.resource) {
            switch (mapBack.ani) {
                case 0: {
                    // sprite
                    const spriteRes = <WZ.Sprite>mapBack.resource;
                    const spriteImageUrl = new URL(spriteRes.resourceUrl, baseUrl).toString();

                    PIXI.Assets.load<PIXI.Texture>(spriteImageUrl)
                        .then((res) => {
                            const spriteObj = new MaplestorySprite(res);
                            spriteObj.position.set(mapBack.x, mapBack.y);
                            spriteObj.pivot.set(spriteRes.originX, spriteRes.originY);
                            if (mapBack.flipX) {
                                spriteObj.scale.x = -1;
                            }
                            const backObj = rootLayer.addChild(new MaplestoryTilingSprite(viewport, mapBack, spriteObj));
                            backObj.alpha = mapBack.alpha / 255.0;
                            backObj.zIndex = mapBack.id + 1;
                            backObj.autoUpdate = true;
                        })
                }
                    break;
                case 1: {
                    // frameAni
                    const frameAni = <WZ.FrameAnimate>mapBack.resource;

                    renderFrames(frameAni, (frames) => {
                        const aniObj = new MaplestoryAnimatedSprite(frames, false);
                        aniObj.rawFrames = frameAni.frames;
                        aniObj.position.set(mapBack.x, mapBack.y);
                        if (mapBack.flipX) {
                            aniObj.scale.x = -1;
                        }
                        aniObj.loop = true;
                        aniObj.play();
                        const backObj = rootLayer.addChild(new MaplestoryTilingSprite(viewport, mapBack, aniObj));
                        backObj.alpha = mapBack.alpha / 255.0;
                        backObj.zIndex = mapBack.id + 1;
                        backObj.autoUpdate = true;
                    })
                }
                    break;
                case 2: // Spine
            }
        }
    }

}

function renderMapLayerObjs(layerContainer: PIXI.Container, mapLayerObjs: Array<WZ.MapObj> | undefined): void {
    if (!mapLayerObjs) {
        return
    }

    const objContainer = layerContainer.addChild(new PIXI.Container());
    objContainer.sortableChildren = true;
    for (let j = 0; j < mapLayerObjs.length; j++) {
        const mapObj = mapLayerObjs[j]
        const frameAni = mapObj.resource
        if (frameAni && frameAni.frames) {
            renderFrames(frameAni, (frames) => {
                const aniObj = objContainer.addChild(new MaplestoryAnimatedSprite(frames));
                aniObj.rawFrames = frameAni.frames;
                aniObj.position.set(mapObj.x, mapObj.y);
                aniObj.zIndex = compositeZIndex(mapObj.z, mapObj.id);
                if (mapObj.flipX) {
                    aniObj.scale.x = -1;
                }
                aniObj.loop = true;
                aniObj.play();
            })

        }
    }
}

function renderMapLayerTiles(layerContainer: PIXI.Container, mapLayerTiles: Array<WZ.MapTile> | undefined): void {
    if (!mapLayerTiles) {
        return
    }

    const tileContainer = layerContainer.addChild(new PIXI.Container());
    tileContainer.sortableChildren = true;
    // 用于后续 index 索引
    const mapTileList = new Array<WZ.MapTile>()
    const promiseList = new Array<Promise<PIXI.Texture<PIXI.Resource>>>();
    for (let j = 0; j < mapLayerTiles.length; j++) {
        const mapTile = mapLayerTiles[j]
        if (mapTile.resource) {
            const spriteImageUrl = new URL(mapTile.resource.resourceUrl, baseUrl).toString();
            const texture = PIXI.Assets.load<PIXI.Texture>(spriteImageUrl);
            promiseList.push(texture)
            mapTileList.push(mapLayerTiles[j])
        }
    }

    promiseWithIndex(promiseList).then(results => {
        results.forEach(({ texture, index }) => {
            const spriteObj = tileContainer.addChild(new PIXI.Sprite(texture));
            const mapTile = mapTileList[index]

            spriteObj.position.set(mapTile.x, mapTile.y);
            spriteObj.pivot.set(mapTile.resource.originX, mapTile.resource.originY);
            spriteObj.zIndex = compositeZIndex(mapTile.resource.z, mapTile.id);
        })
    })
}

function renderMapLayerLifes(layerContainer: PIXI.Container, mapLayerLifes: Array<WZ.MapLife> | undefined): void {
    if (!mapLayerLifes) {
        return
    }

    const lifeContainer = layerContainer.addChild(new PIXI.Container());
    lifeContainer.sortableChildren = true;
    for (let j = 0; j < mapLayerLifes.length; j++) {
        const maplife = mapLayerLifes[j];
        const frameAni = maplife.resource;

        if (frameAni && frameAni.frames) {
            renderFrames(frameAni, (frames) => {
                const aniObj = lifeContainer.addChild(new MaplestoryAnimatedSprite(frames));
                aniObj.rawFrames = frameAni.frames;
                aniObj.position.set(maplife.x, maplife.y);
                aniObj.zIndex = compositeZIndex(maplife.z, maplife.id);
                if (maplife.flipX) {
                    aniObj.scale.x = -1;
                }

                aniObj.loop = true;

                let frontColor = '0xFFFF00';

                if (maplife.type == 'm') {
                    frontColor = '0xFFFFFF'
                }

                if (maplife.lifeName) {
                    const fontSize = 12;

                    const namePlateContainer = new PIXI.Container();

                    namePlateContainer.position.set(maplife.x, maplife.y + 2); // 设置姓名牌容器的位置为动画对象底部
                    lifeContainer.addChild(namePlateContainer);
                    //要先生成名字才知道宽度
                    const nameText1 = new PIXI.Text(maplife.lifeName, { fontFamily: "SimSun", fontSize: fontSize, fill: frontColor, textBaseline: 'alphabetic', lineHeight: fontSize + 1 });

                    //画背景
                    const nameText1Background = new PIXI.Graphics();
                    nameText1Background.position.set(0, 2);
                    nameText1Background.beginFill(0xff000000, 0.65);
                    nameText1Background.drawRoundedRect(-nameText1.width / 2 - 5, 0, nameText1.width + 10, nameText1.height + 5, 3); // 调整背景尺寸和位置
                    nameText1Background.endFill();
                    namePlateContainer.addChild(nameText1Background); // 将背景放在容器的底部
                    //画名字
                    // nameText1.anchor.set(5,2); // 要回调回去 
                    nameText1.position.set(-nameText1.width / 2, 2);
                    nameText1.texture.baseTexture.scaleMode = PIXI.SCALE_MODES.NEAREST;
                    nameText1Background.addChild(nameText1);
                }
                aniObj.play();
            })
        }
    }

}

function renderMapLayers(mapLayers: Array<WZ.MapLayer>): void {
    if (!mapLayers) {
        return
    }

    for (let i = 0; i < mapLayers.length; i++) {
        const mapLayer = mapLayers[i];
        const layerContainer = viewport.addChild(new PIXI.Container());
        layerContainer.zIndex = i + 1;

        renderMapLayerObjs(layerContainer, mapLayer.objs)

        renderMapLayerTiles(layerContainer, mapLayer.tiles)

        renderMapLayerLifes(layerContainer, mapLayer.lifes)
    }
}

function renderMapPortals(mapPortals: Array<WZ.MapPortal>): void {
    if (!mapPortals) {
        return
    }

    const portalContainer = viewport.addChild(new PIXI.Container());
    portalContainer.sortableChildren = true;
    portalContainer.zIndex = 99;
    for (let j = 0; j < mapPortals.length; j++) {
        const mapportal = mapPortals[j];
        const frameAni = mapportal.resource;
        if (frameAni && frameAni.frames) {
            renderFrames(frameAni, (frames) => {
                const aniObj = portalContainer.addChild(new MaplestoryAnimatedSprite(frames));
                aniObj.rawFrames = frameAni.frames;
                aniObj.position.set(mapportal.x, mapportal.y);
                aniObj.play();
                aniObj.loop = true;
            })
        }
    }
}

function renderMapReactors(mapReactors: Array<WZ.MapReactor>): void {
    if (!mapReactors) {
        return
    }

    const portalContainer = viewport.addChild(new PIXI.Container());
    portalContainer.sortableChildren = true;
    portalContainer.zIndex = 99;

    for (let j = 0; j < mapReactors.length; j++) {
        const mapReactor = mapReactors[j];
        const frameAni = mapReactor.resource;
        if (frameAni && frameAni.frames) {
            renderFrames(frameAni, (frames) => {
                const aniObj = portalContainer.addChild(new MaplestoryAnimatedSprite(frames));
                aniObj.rawFrames = frameAni.frames;
                aniObj.position.set(mapReactor.x, mapReactor.y);
                aniObj.play();
                aniObj.loop = true;
            })
        }
    }
}

async function loadAndRenderMap(mapID: number): Promise<void> {
    const mapInfo = await WZ.loadMapInfo(mapID, baseUrl);

    viewportSetup(mapInfo)

    renderMapBacks(mapInfo.backs)

    renderMapLayers(mapInfo.layers)

    renderMapPortals(mapInfo.mapPortals)

    renderMapReactors(mapInfo.mapReactors)
}

viewport.sortableChildren = true;

const queryString = new URLSearchParams(window.location.search);
const mapID = Number.parseInt(queryString.get("mapID") || "100000000");  // <- change to your own
const clientVer = queryString.get("ver") || "CMST-193";                  // <- change to your own
const baseUrl = new URL(``, "https://patchwiki.biligame.com/images/maplestory");

PIXI.Ticker.shared.autoStart = false;
loadAndRenderMap(mapID).then(mapInfo => {
    console.log("success");
    PIXI.Ticker.shared.start();
}).catch(e => {
    console.error(e);
    console.log("地图加载出错")
    const mapElement = document.getElementById("map");
    if (mapElement) {
        mapElement.remove();
    }
    // 修改 <div> 元素的内容
    const noticeElement = document.getElementById("notice");
    if (noticeElement) {
        noticeElement.innerHTML = "此地图无法模拟或者模拟错误<br/>如非莫奈德系列地图请联系 龙胶水";
        noticeElement.style.display = "block";
    }
}); 