// ==UserScript==
// @name         Audible HQ Cover
// @namespace    https://greasyfork.org/en/users/1370205
// @version      0.1.0
// @description  Replace the default audible cover with a HQ version, with 'Open' and 'Download' actions
// @license      MIT
// @match        https://*.audible.*/pd/*
// @match        https://*.audible.*/ac/*
// ==/UserScript==

const MARKETPLACE = {
	us: { tld: 'com', flag: '🇺🇸', name: 'US' },
	uk: { tld: 'co.uk', flag: '🇬🇧', name: 'UK' },
	ca: { tld: 'ca', flag: '🇨🇦', name: 'Canada' },
	au: { tld: 'com.au', flag: '🇦🇺', name: 'Australia' },
	de: { tld: 'de', flag: '🇩🇪', name: 'Germany' },
	fr: { tld: 'fr', flag: '🇫🇷', name: 'France' },
	es: { tld: 'es', flag: '🇪🇸', name: 'Spain' },
	it: { tld: 'it', flag: '🇮🇹', name: 'Italy' },
	in: { tld: 'in', flag: '🇮🇳', name: 'India' },
}

function extractRegionFromUrl(url) {
	try {
		const { hostname } = new URL(url)
		for (const [key, marketplace] of Object.entries(MARKETPLACE)) {
			if (hostname.endsWith(marketplace.tld)) {
				return key
			}
		}
		return null
	} catch (e) {
		console.error('Invalid URL:', e)
		return null
	}
}

function extractAsinFromUrl(url) {
	const asinMatch = url.pathname.match(/\/([A-Z0-9]{10})/)
	return asinMatch ? asinMatch[1] : null
}

function getTld(region) {
	return MARKETPLACE[region].tld || 'com'
}

function getAudibleApiUrl(region) {
	const tld = getTld(region)
	return new URL(`https://api.audible.${tld}/1.0`).href
}

const fetchProductData = async (region, asin, query) => {
	const baseUrl = getAudibleApiUrl(region)
	const url = new URL(`${baseUrl}/catalog/products/${asin}`)

	url.searchParams.append('num_results', '1')
	Object.entries(query).forEach(([key, value]) => {
		url.searchParams.append(key, value)
	})

	const response = await fetch(url.href, {
		method: 'GET',
		headers: {
			'Content-Type': 'application/json',
		},
	})

	if (!response.ok) {
		throw new Error(`HTTP error! status: ${response.status}`)
	}

	return await response.json()
}

async function fetchAudibleProductImages(region, asin) {
	const data = await fetchProductData(region, asin, {
		response_groups: 'media',
		image_sizes: 2400,
		num_results: '1',
	})
	return data.product.product_images
}

function extractParams() {
	const url = window.location
	const region = extractRegionFromUrl(url)
	const asin = extractAsinFromUrl(url)
	return { region, asin }
}

function iconifyIcon(name) {
	return `https://api.iconify.design/solar:${name}.svg`
}

function createButton(iconUrl, iconText, action, tooltip) {
	const btn = previewBtn.cloneNode(true)
	btn.removeAttribute('id')
	btn.setAttribute('aria-label', tooltip)
	btn.removeAttribute('data-asin')
	btn.removeAttribute('data-is-sample')

	const iconImg = document.createElement('img')
	iconImg.src = iconUrl
	iconImg.alt = ''
	iconImg.style.marginRight = '4px'
	iconImg.style.width = '16px'
	iconImg.style.height = '16px'

	btn.textContent = ''

	btn.appendChild(iconImg)
	btn.appendChild(document.createTextNode(iconText))

	btn.title = tooltip

	btn.addEventListener('click', (e) => {
		e.preventDefault()
		action()
	})

	return btn
}

function downloadImage(imageUrl, fileName) {
	fetch(imageUrl)
		.then((response) => response.blob())
		.then((blob) => {
			const url = window.URL.createObjectURL(blob)
			const link = document.createElement('a')
			link.href = url
			link.download = fileName
			link.style.display = 'none'
			document.body.appendChild(link)
			link.click()
			window.URL.revokeObjectURL(url)
			document.body.removeChild(link)
		})
		.catch((error) => console.error('Error downloading image:', error))
}

function replaceCoverUrl(coverUrl) {
	const imageElement = document.querySelector('div.bc-col-12 img.bc-pub-block')

	if (imageElement) {
		imageElement.src = coverUrl
		imageElement.draggable = true
		console.log('🖼️ Replaced cover image', coverUrl)
	} else {
		console.warn('Cover image element not found.')
	}
}

const injectCoverButtons = (coverUrl, asin) => {
	const previewBtn = document.querySelector('adbl-button[slot="sample-button"]')
	if (!previewBtn) {
		console.error('Preview button not found')
		return
	}

	const btnContainer = document.createElement('div')
	btnContainer.style.cssText = `
		display: flex;
		gap: 5px;
		margin-top: 10px;
	`

	const createButton = (iconUrl, iconText, action, tooltip) => {
		const btn = previewBtn.cloneNode(true)
		btn.removeAttribute('id')
		btn.setAttribute('aria-label', tooltip)
		btn.removeAttribute('data-asin')
		btn.removeAttribute('data-is-sample')

		const iconImg = document.createElement('img')
		iconImg.src = iconUrl
		iconImg.alt = ''
		iconImg.style.marginRight = '4px'
		iconImg.style.width = '16px'
		iconImg.style.height = '16px'

		btn.style.flex = '1'

		btn.textContent = ''
		btn.appendChild(iconImg)
		btn.appendChild(document.createTextNode(iconText))

		btn.title = tooltip

		btn.addEventListener('click', (e) => {
			e.preventDefault()
			action()
		})

		return btn
	}

	const openBtn = createButton(
		iconifyIcon('gallery-minimalistic-bold'),
		'Open',
		() => window.open(coverUrl, '_blank'),
		'Open cover'
	)

	const downloadBtn = createButton(
		iconifyIcon('download-square-bold'),
		'Download',
		() => {
			downloadImage(coverUrl, `${asin}.jpg`)
		},
		'Download cover'
	)

	btnContainer.appendChild(openBtn)
	btnContainer.appendChild(downloadBtn)

	previewBtn.parentNode.insertBefore(btnContainer, previewBtn.nextSibling)
}

const COVER_SIZE = 2400

const main = async () => {
	try {
		const { region, asin } = extractParams()

		if (!region || !asin) {
			throw new Error('Unable to extract region or ASIN from URL')
		}

		const images = await fetchAudibleProductImages(region, asin)

		if (!images || !images[2400]) {
			throw new Error('No 2400px image found')
		}

		const cover = images[2400]

		injectCoverButtons(cover, asin)
		replaceCoverUrl(cover)
	} catch (error) {
		console.error('Error in main function:', error.message)
	}
}

main()
